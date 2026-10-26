# MindFlow AI — RAG System Design Documentation

> **Capstone:** Internal Engineering Knowledge Assistant  
> **Author:** Rahul Khanal  
> **Date:** October 2026

---

## 1. System Overview

MindFlow AI is an end-to-end Retrieval-Augmented Generation (RAG) pipeline that answers natural-language questions over a user-uploaded engineering knowledge base. Users upload PDFs or paste notes; the system chunks, embeds, and stores them in a vector database. At query time, the most relevant chunks are retrieved and injected into a prompt sent to a large language model, which produces a grounded answer.

```
User question
     │
     ▼
[Titan V2 Embeddings]  ──embed query──▶  [pgvector similarity search]
                                                    │
                                            top-k chunks
                                                    │
                                                    ▼
                                     [System prompt + context + question]
                                                    │
                                                    ▼
                                         [Amazon Nova Lite LLM]
                                                    │
                                                    ▼
                                            Grounded answer
```

---

## 2. Component Decisions

### 2.1 Chunking Strategy

| Parameter | Value | Justification |
|---|---|---|
| Splitter | `RecursiveCharacterTextSplitter` | Tries paragraph → sentence → word boundaries in order, preserving semantic units better than fixed-character splits |
| `chunk_size` | **1000 characters** | Balances context density vs retrieval precision. Titan V2's 8192-token limit means large chunks are fine, but smaller chunks improve retrieval recall on specific questions. 1000 chars ≈ 150–200 tokens — well within limits and fine-grained enough for specific queries |
| `chunk_overlap` | **100 characters** | 10% overlap prevents answers that span a chunk boundary from being missed. Without overlap, a sentence split across two chunks can cause both halves to score below the similarity threshold |
| Splitter strategy | Recursive (paragraph → sentence → word) | Preserves semantic coherence; avoids splitting mid-sentence which would make chunk embeddings noisier |

**Alternative considered:** Fixed-size 512-token chunks (common default). Rejected because it ignores document structure (e.g., splits tables, code blocks mid-way).

---

### 2.2 Embedding Model

**Model:** `amazon.titan-embed-text-v2:0`  
**Dimension:** 1024 (default)  
**Provider:** Amazon Bedrock

**Justification:**
- Already within Bedrock — no additional API key or service needed alongside the LLM
- Titan V2 outperforms Titan V1 on MTEB benchmarks, particularly on retrieval tasks (BEIR suite), which is the primary use case here
- 8192-token input limit means even long code blocks or multi-paragraph documentation chunks embed without truncation
- Consistent credential path: same boto3 client used for both embeddings and LLM, reducing configuration surface area

**Alternatives considered:**

| Model | Why rejected |
|---|---|
| `text-embedding-ada-002` (OpenAI) | Would require a second API key and vendor; adds cost and latency |
| `cohere.embed-english-v3` (Bedrock) | Similar quality but less mature LangChain integration at implementation time |
| Local `all-MiniLM-L6-v2` | Free, but 384-dimension embeddings are lower quality; no GPU available in deployment environment |

---

### 2.3 Vector Store

**Store:** PostgreSQL + `pgvector` extension  
**Library:** `langchain-postgres` (`PGVector`)

**Justification:**
- The project already uses PostgreSQL for all application data (users, maps, conversations). Adding pgvector means zero additional infrastructure — same DB, same connection pool, same backup strategy
- pgvector supports exact and approximate nearest-neighbour (HNSW / IVFFlat) indices; for datasets under ~100k chunks exact search is fast enough
- `use_jsonb=True` stores chunk metadata (source_id, source_name, source_type) alongside embeddings in a single table, enabling source attribution in answers

**Alternative considered:** Pinecone, Weaviate, Chroma. All require a separate service / process. Chroma is in-memory and not suitable for multi-user persistent storage.

---

### 2.4 Retrieval k

**`k = 4`** chunks returned per query.

**Justification:**
- Empirically, 3–5 chunks is the sweet spot for single-question RAG: enough context to synthesise a complete answer, few enough that the prompt stays focused and the LLM is not distracted by irrelevant passages
- Nova Lite's 200k context window makes large k technically possible, but too many chunks dilute the signal-to-noise ratio and increase cost
- k=4 at 1000 chars/chunk = ~4000 chars injected context, well within safe limits for fast inference

**Ablation considered:** k=2 (misses multi-chunk answers), k=8 (higher noise, more tokens, slower). k=4 was chosen as the midpoint.

---

### 2.5 LLM Choice

**Model:** `amazon.nova-lite-v1:0` (cross-region inference prefix: `us.amazon.nova-lite-v1:0`)  
**Provider:** Amazon Bedrock via `ChatBedrockConverse`

| Parameter | Value | Justification |
|---|---|---|
| `max_tokens` | 4096 | Long enough for detailed technical answers; capped to control cost |
| `timeout` | 90 s | Nova Lite can be slow on first cold-start; 90s prevents premature 504s |
| `max_retries` | 1 | One automatic retry on transient errors (throttling, timeout) without hammering the API |
| Temperature | Default (≈ 0.7) | RAG answers should be factual; ideally 0.0–0.3. **Improvement:** set `temperature=0.1` to reduce creative embellishment |

**Why Nova Lite:**
- Available within the training/capstone AWS account without additional model access requests
- 200k context window accommodates large retrieved contexts and long conversation histories
- Cost-effective for development; Nova Pro is available if higher quality is needed
- `with_structured_output()` support for mind map generation (Pydantic schema)

**Alternatives considered:**

| Model | Why not chosen |
|---|---|
| Claude 3 Haiku | Better quality but requires separate Anthropic API key |
| GPT-4o (OpenAI) | Higher cost, external vendor, not in Bedrock ecosystem |
| Amazon Nova Micro | Faster/cheaper but weaker instruction following for complex RAG tasks |
| Llama 3 (Bedrock) | Open-source appeal, but less consistent structured-output support |

---

## 3. Anti-Hallucination Constraint

> *"A system that confidently hallucinates is worse than one that says 'I don't know.'"*

This constraint is enforced at **three levels:**

### 3.1 System Prompt (hard instruction)

The RAG system prompt (`services/rag_service.py`) contains explicit rules:

```
STRICT RULES — follow every one, always:
1. Answer ONLY from information explicitly present in the context.
2. If the context is empty, or does not contain sufficient information to answer
   the question, you MUST respond with exactly:
   "I don't have enough information in my knowledge base to answer that.
    Try uploading relevant documents or adding notes and ask again."
   Do NOT attempt to answer from general knowledge or training data.
3. Never speculate, infer beyond what the context states, or fill gaps with assumptions.
4. If you are partially confident, state exactly which part of your answer comes from
   the context and flag what is uncertain.
5. Cite the source document name when it is available in the context metadata.

A system that confidently hallucinates is worse than one that says 'I don't know.'
```

### 3.2 Retrieval Gate

If pgvector returns an empty result set (no documents uploaded, or query too dissimilar to any chunk), `_retrieve_context()` returns an empty string. The LLM receives an empty context block and the system prompt's Rule 2 forces the "I don't know" response.

### 3.3 Evaluation (LLM-as-judge)

The eval suite (`eval/run_eval.py`) includes 2 out-of-scope queries (IDs 9 and 10) that explicitly test hallucination. The judge awards `groundedness=0` if the system fabricates an answer instead of declining. A hallucination on an out-of-scope query is flagged in the summary output.

---

## 4. Evaluation Suite

### 4.1 Methodology

**Script:** `eval/run_eval.py`  
**Judge model:** Amazon Nova Lite (same model, separate invocation — avoids self-evaluation bias would be mitigated by using a different model in production)  
**Dimensions:** Correctness, Groundedness, Relevance (each 0–3)  
**Total per query:** 9 points  
**Total suite:** 90 points

### 4.2 Query Design

| ID | Category | Question | Rationale |
|---|---|---|---|
| 1 | IN_SCOPE | Purpose of /api/files/upload | Tests factual API retrieval |
| 2 | IN_SCOPE | Authentication mechanism | Tests architecture retrieval |
| 3 | IN_SCOPE | AI model for mind maps | Tests specific technology retrieval |
| 4 | IN_SCOPE | How PDFs are processed | Tests pipeline description retrieval |
| 5 | IN_SCOPE | Vector storage database | Tests infrastructure retrieval |
| 6 | EDGE | Max retries for Bedrock calls | Tests specific numeric config retrieval |
| 7 | EDGE | Handling expired AWS tokens | Tests error-handling logic (cross-chunk) |
| 8 | EDGE | Simultaneous map editing | Tests WebSocket behaviour description |
| 9 | OUT_SCOPE | Capital of France | Completely off-topic — must trigger I don't know |
| 10 | OUT_SCOPE | Kubernetes TLS ingress | Engineering topic but not in knowledge base |

### 4.3 Running the Evaluation

```bash
cd BE-FastAPI
python -I ../eval/run_eval.py
```

Results are printed to stdout and saved as `eval/eval_results_<timestamp>.json`.

### 4.4 Scoring Interpretation

| Score range | Interpretation |
|---|---|
| 81–90 (90–100%) | Excellent — production ready |
| 63–80 (70–89%) | Good — minor gaps in retrieval |
| 45–62 (50–69%) | Acceptable — needs more documents or tuning |
| < 45 (< 50%) | Poor — chunking or embedding needs rework |

Any hallucination on OUT_SCOPE queries is a **critical failure** regardless of total score.

---

## 5. Failure Modes & Analysis

### 5.1 Known Failure: Empty Knowledge Base

**Symptom:** Every question returns "I don't have enough information..."  
**Root cause:** No documents ingested; retriever returns zero chunks  
**Detection:** All IN_SCOPE queries score 0 in the eval suite  
**Mitigation:** Users must upload relevant PDFs or add knowledge notes before querying

### 5.2 Known Failure: Cross-Document Synthesis

**Symptom:** Questions requiring synthesis across multiple documents score low  
**Root cause:** k=4 may not retrieve chunks from all relevant documents  
**Mitigation:** Increase k to 6–8 for multi-document corpora; implement MMR (Maximal Marginal Relevance) retrieval to ensure diversity

### 5.3 Known Failure: Expired AWS Session Tokens

**Symptom:** 502 errors in chat with "token expired" message  
**Root cause:** Temporary STS tokens expire mid-session  
**Mitigation:** Explicit `ExpiredTokenException` handling in all AI service functions; users see a clear error message rather than a generic 502

### 5.4 Known Limitation: Temperature

**Current:** Default temperature (~0.7) — allows some creative generation  
**Risk:** Slight hallucination embellishment even with grounding instructions  
**Fix:** Set `temperature=0.1` in `get_chat_model()` for RAG chain specifically

### 5.5 Known Limitation: Chunk Boundary Splitting

**Symptom:** Answers to questions spanning a section heading and its content are incomplete  
**Root cause:** Chunk boundary falls between heading and body text  
**Fix:** Increase `chunk_overlap` to 200 characters, or use a semantic chunker

---

## 6. Recommended Improvements

1. **Set temperature=0.1** for the RAG chain (keep higher for creative mind map generation)
2. **Increase k to 6** and enable MMR retrieval for multi-document corpora
3. **Add chunk_overlap=200** to reduce boundary-split failures
4. **Switch judge model** to a different LLM (e.g., Claude) to avoid self-evaluation bias
5. **Add source citations** — extract `source_name` from retrieved chunk metadata and append to answers
6. **Stream responses** — use LangChain streaming to reduce perceived latency on long answers

---

## 7. Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| API framework | FastAPI | 0.115.x |
| LLM | Amazon Nova Lite | `amazon.nova-lite-v1:0` |
| Embeddings | Amazon Titan V2 | `amazon.titan-embed-text-v2:0` |
| Vector store | PostgreSQL + pgvector | pg 16, pgvector 0.7 |
| LangChain | langchain-aws, langchain-postgres | 0.2.x |
| PDF loader | PyPDFLoader (LangChain) | — |
| Auth | JWT (python-jose) + bcrypt | 7-day tokens |
| Real-time | WebSocket (FastAPI) | — |
| Frontend | React + TypeScript + Vite | React 18 |
| Mind map canvas | @xyflow/react | 12.x |

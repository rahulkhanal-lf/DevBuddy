# MindFlow AI — RAG System Decisions

> **Capstone:** Internal Engineering Knowledge Assistant  
> **Author:** Rahul Khanal  
> **Date:** October 2026

---

## 1. Corpus Choice

**Corpus:** MindFlow AI engineering documentation — the system's own technical documentation covering the API specification, authentication design, RAG pipeline architecture, real-time collaboration protocol, and database schema.

**Why this corpus:**
- I am the author and have complete familiarity with it — essential for honestly judging whether answers are correct
- Technical depth: covers multiple interconnected systems (FastAPI, pgvector, Bedrock, WebSocket), giving the RAG system genuine synthesis challenges
- Realistic scope: PDFs and notes uploaded through the running application form the knowledge base, mirroring the product's intended use case

**Estimated size:** The corpus across uploaded PDFs and knowledge notes covers the project's full technical scope — API documentation (~15 pages), architecture notes (~10 pages), and code-level documentation (~25 pages), totalling approximately 60–80k tokens.

**Corpus constraint:** The system answers only from retrieved chunks. Out-of-corpus queries (Q9, Q10) must produce "I don't know" responses, not training-data answers. This is enforced both in the system prompt and tested in the evaluation suite.

---

## 2. LLM Selection

**Model:** `amazon.nova-lite-v1:0` via Amazon Bedrock (`ChatBedrockConverse`)

**Why Nova Lite:**
- Available within the capstone AWS account without additional model-access requests
- 200k-token context window accommodates large retrieved contexts and long conversation histories
- Supports `with_structured_output()` via Pydantic schemas for structured output validation
- Cost-effective for development-time experimentation; Nova Pro available as a quality upgrade

**Same model used as judge:** Yes — the eval judge is also Nova Lite. This introduces self-evaluation bias (a model may favour its own phrasing). In production, using a different model family (e.g., Claude) as the judge would give more independent scores. This limitation is documented in `eval/DOCUMENTATION.md`.

**Alternatives considered:**

| Model | Reason not chosen |
|---|---|
| Claude 3 Haiku | Better quality but requires a separate Anthropic API key and vendor |
| GPT-4o | Higher cost, external vendor, not in Bedrock ecosystem |
| Amazon Nova Micro | Faster/cheaper but weaker instruction following for complex RAG |
| Llama 3 (Bedrock) | Less consistent structured-output support at implementation time |

---

## 3. Temperature

**Value:** `0.1`

**Justification:** RAG answers must be factual and grounded. High temperature (≥ 0.5) increases creative variation, which is useful for brainstorming but produces subtle hallucination in grounded QA — the model embellishes retrieved facts with plausible-sounding additions. A temperature of 0.1 keeps responses deterministic enough for repeatable evaluation while avoiding the zero-temperature repetition loop that some models exhibit.

**Initial state:** The first implementation used the default temperature (~0.7). During manual testing, responses on in-corpus-multi queries added speculative connector phrases ("this likely means…") not present in the retrieved chunks. Setting temperature=0.1 eliminated this. This motivated the v2 prompt (see Prompt Version History).

**Judge temperature:** `0` — the judge must be fully deterministic; the same chunks and answer should always receive the same score.

---

## 4. Retrieval k

**Final value:** `k = 4`

**Experimentation:**

| k | Observed behaviour |
|---|---|
| 3 | Missed information on multi-chunk questions (Q4, Q5, Q6). The PDF processing pipeline spans at least 4 distinct chunks; k=3 left the ingestion or the storage step out of context |
| 4 | Multi-chunk questions answered completely; single-chunk questions still sharp (unused chunks do not confuse the answer because the grounding rules prevent the model from drawing on them) |
| 6 | No quality improvement on the test set; slightly longer latency and higher token cost; diluted context on focused single-chunk questions |

**Final justification:** k=4 at 1000 characters/chunk injects approximately 4 000 characters of context — enough for synthesis without noise. Nova Lite's 200k window makes larger k technically feasible, but signal-to-noise ratio degrades.

**Failure analysis (Section 7):** Running the evaluation with k=1 (`--k 1`) and comparing scores demonstrates the eval suite's sensitivity to retrieval quality. Expected outcome: in-corpus-multi and ambiguous queries drop to answer_score ≤ 2 while single-chunk queries degrade less severely.

---

## 5. Embedding Model

**Model:** `amazon.titan-embed-text-v2:0`  
**Dimension:** 1024 (default)  
**Provider:** Amazon Bedrock

**Justification:**
- Same boto3 client and credential path as the LLM — zero additional configuration
- Titan V2 outperforms Titan V1 on MTEB Retrieval benchmarks (BEIR suite), which is this system's primary use case
- 8192-token input limit means even large code blocks or multi-paragraph documentation chunks embed without truncation
- `use_jsonb=True` in PGVector stores chunk metadata (`source_id`, `source_name`, `source_type`) alongside embeddings, enabling source attribution in structured output

**MTEB reference:** Titan V2 scores 60.9 average on MTEB Retrieval (English), vs. Titan V1's 52.1 — a meaningful gap for a retrieval-first use case.

**Alternatives considered:**

| Model | Reason not chosen |
|---|---|
| `text-embedding-ada-002` (OpenAI) | Requires a second API key and vendor |
| `cohere.embed-english-v3` (Bedrock) | Similar quality; less mature LangChain integration at implementation time |
| `all-MiniLM-L6-v2` (local) | 384-dimension embeddings — lower quality; no GPU in deployment env |

---

## 6. Chunking Strategy

**Splitter:** `RecursiveCharacterTextSplitter`  
**chunk_size:** 1000 characters  
**chunk_overlap:** 100 characters

**Why RecursiveCharacterTextSplitter:** Tries paragraph → sentence → word boundaries in order, preserving semantic units better than fixed-character splits. This is important for technical documentation where paragraphs and bullet-point lists are the primary structure.

**Why chunk_size=1000:** Balances context density against retrieval precision. At 1000 characters (~150–200 tokens), each chunk is fine-grained enough that similarity search can pinpoint a specific concept, yet large enough to include the surrounding sentence context needed to understand it. Smaller chunks (≤ 500) score better on single-concept retrieval but fragment multi-sentence explanations.

**Why chunk_overlap=100:** 10% overlap prevents answers that span a chunk boundary from being missed. Without overlap, a procedure described across two chunks (e.g., "upload file → chunk → embed → store") can have each step below the similarity threshold individually.

**Alternative considered:** Fixed-size 512-token chunks (Langchain default). Rejected because it ignores document structure and frequently splits numbered lists or code blocks mid-way, producing incoherent chunks.

---

## 7. Prompting Techniques — Chain of Thought (CoT)

**Where CoT is applied:** The **judge prompt** in `eval/run_eval.py`.

**Why the judge prompt rather than the QA prompt:**
The QA system prompt uses grounding rules that constrain output to the retrieved context. Adding an explicit "reason step by step" instruction to the QA prompt risks the model generating reasoning text that it then truncates, or worse, reasoning itself into speculative territory. The judge, by contrast, benefits from explicit deliberation: it must independently assess retrieved chunk relevance AND answer groundedness — two separate judgments that benefit from sequential reasoning.

**Judge CoT structure:**
```
Step 1: What is the question specifically asking for?
Step 2: What information do the retrieved chunks actually contain?
Step 3: Does the final answer directly address the question?
Step 4: Are there gaps, hallucinations, or irrelevant content in the answer?
→ Then assign retrieval_score and answer_score (1–5 each)
```

**What was observed:** Without CoT, the judge frequently anchored to answer length — longer answers received higher scores regardless of groundedness. With CoT, the judge correctly penalised verbose answers that included unsupported claims, and correctly awarded high scores to brief but accurate "I don't know" responses on out-of-corpus queries.

---

## 8. Structured Output

**Schema:**
```python
class RAGResponse(BaseModel):
    answer: str           # LLM-generated answer grounded in retrieved context
    sources: list[str]    # unique source document names from chunk metadata
    prompt_tokens: int    # input tokens (Bedrock SDK usage_metadata)
    completion_tokens: int  # output tokens
```

**Enforcement approach:**
- `RAGResponse` is a Pydantic `BaseModel`. The `rag_chat_structured()` function constructs it explicitly — `answer` from `response.content`, `sources` from chunk metadata, tokens from `response.usage_metadata`. Pydantic validates types at construction; a malformed response raises `ValidationError` rather than silently returning wrong types.
- Sources are extracted from **chunk metadata** (not asked of the LLM). This is deliberately more reliable: LLMs can hallucinate source names, but pgvector's metadata is the ground truth of what was retrieved.
- `with_structured_output()` was considered but rejected for the eval path because it wraps the response object and discards `usage_metadata`, making token logging impossible without additional callback machinery.

**Schema for the judge:** The judge's structured response uses `cot_reasoning`, `retrieval_score`, and `answer_score`. JSON is enforced by the judge system prompt ("Respond with ONLY valid JSON") plus a code-fence stripping fallback in the parser.

---

## 9. Token Consumption Analysis

Token usage is logged per query in `project/results/eval_results.csv` under `prompt_tokens` and `completion_tokens`.

**Expected findings:**
- **in-corpus-multi queries** (Q4–Q6) will consume the most prompt tokens because they retrieve all k=4 chunks AND the question requires synthesis — the retrieved context is longer and more varied than single-concept questions.
- **out-of-corpus queries** (Q9–Q10) will consume the fewest prompt tokens: pgvector returns chunks with low similarity scores (effectively noise), the LLM produces a short "I don't know" response, and completion_tokens stays low.
- **ambiguous queries** (Q7–Q8) land in between: the retriever returns chunks that partially match the broad question, injecting medium-length context.

**Why in-corpus-multi queries use the most tokens:**
The question "How does MindFlow AI process a PDF file from upload through to being searchable?" (Q4) pulls chunks from the upload API, the ingestion pipeline, and the pgvector storage layer. Each of k=4 chunks is near-1000 characters. Combined with the v2 system prompt (~350 tokens), this yields the largest possible prompt. The LLM then generates a step-by-step synthesis answer, producing the highest completion token count too.

---

## 10. Prompt Version History

### v1 — `prompts/system_qa_v1.md`

**Initial prompt (3 rules, minimal structure):**
- "Answer ONLY from the context."
- "If context is insufficient, say 'I don't have enough information.'"
- "Never speculate."

**Problem observed:** During manual testing, the model answered in-corpus-multi questions with confident connector phrases like "this likely means" and "in other words" that were not in the retrieved chunks. Temperature was still at default (~0.7) at this point. The model also occasionally answered out-of-corpus queries with training-data answers instead of declining.

### v2 — `prompts/system_qa_v2.md`

**Changes from v1:**
1. Expanded from 3 rules to 5 STRICT RULES with explicit numbered list
2. Added verbatim "I don't know" response string — the model now matches this exactly, making it detectable and testable
3. Added "Do NOT attempt to answer from general knowledge or training data" (Rule 2) — the v1 wording was ambiguous about the source constraint
4. Added Rule 4 (partial confidence flagging) — encourages calibrated uncertainty instead of silence
5. Added Rule 5 (source citation) — links answers to their source document
6. Added inline CoT instruction: "Before writing your final answer, silently reason through: What does the question ask? What's in the context? Is it sufficient?"
7. Added the principle: "A system that confidently hallucinates is worse than one that says 'I don't know.'"

**Combined with temperature=0.1**, v2 eliminated the speculative connector phrases observed in v1 testing.

---

## 11. Architecture Overview

```
User upload (PDF / text)
      │
      ▼
PyPDFLoader / Document
      │
RecursiveCharacterTextSplitter (chunk_size=1000, overlap=100)
      │
      ▼
BedrockEmbeddings (Titan V2, 1024-dim)
      │
      ▼
PGVector (PostgreSQL + pgvector extension)
      │
      └─────────────────────────────────────────┐
                                                 │ similarity search (k=4)
User question ──► BedrockEmbeddings (Titan V2) ─┘
      │                   │
      │            top-k chunks + metadata
      │                   │
      └──────────────────►│
                           ▼
                 system_qa_v2.md + context + question
                           │
                           ▼
               Amazon Nova Lite (temperature=0.1)
                           │
                           ▼
                    RAGResponse
                  ┌──────────────────────┐
                  │ answer: str          │
                  │ sources: list[str]   │
                  │ prompt_tokens: int   │
                  │ completion_tokens: int│
                  └──────────────────────┘
```

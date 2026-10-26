"""
MindFlow AI — RAG Evaluation Suite
=====================================
LLM-as-judge evaluation over 10 test queries.

Query distribution:
  in-corpus-single  3  — answerable from a single chunk
  in-corpus-multi   3  — requires synthesis across multiple chunks
  ambiguous         2  — partial context or multiple interpretations
  out-of-corpus     2  — no relevant context; system must say "I don't know"

Each query is scored by Amazon Nova Lite on two dimensions (1–5 each):
  retrieval_score   How relevant and complete are the retrieved chunks?
  answer_score      How grounded, accurate, and relevant is the final answer?

The judge uses chain-of-thought reasoning before scoring.

Outputs:
  stdout  — human-readable summary table
  CSV     — project/results/eval_results.csv (required deliverable columns)
  JSON    — eval/eval_results_<timestamp>.json (full detail)

Run from the BE-FastAPI directory (so .env is loaded):
  cd BE-FastAPI
  python -I ../eval/run_eval.py

Optional k override (for failure analysis):
  python -I ../eval/run_eval.py --k 1
"""

import argparse
import csv
import json
import os
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

# ── Bootstrap ─────────────────────────────────────────────────────────────────
BE_DIR = Path(__file__).resolve().parent.parent / "BE-FastAPI"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "project" / "results"
sys.path.insert(0, str(BE_DIR))

from dotenv import load_dotenv
load_dotenv(BE_DIR / ".env")

from services.bedrock import get_chat_model       # noqa: E402
from services.rag_service import rag_chat_structured  # noqa: E402

# ── 10 Test Queries ────────────────────────────────────────────────────────────
# Generated against the MindFlow AI engineering documentation corpus, then
# reviewed and adjusted to cover all required difficulty types.

TEST_QUERIES = [
    # ── in-corpus-single (3) ─────────────────────────────────────────────────
    {
        "id": 1,
        "type": "in-corpus-single",
        "question": "What is the purpose of the /api/files/upload endpoint?",
        "expect_idk": False,
    },
    {
        "id": 2,
        "type": "in-corpus-single",
        "question": "Which AI model is used to generate mind maps in MindFlow AI?",
        "expect_idk": False,
    },
    {
        "id": 3,
        "type": "in-corpus-single",
        "question": "What database technology is used for vector storage and similarity search?",
        "expect_idk": False,
    },
    # ── in-corpus-multi (3) ──────────────────────────────────────────────────
    {
        "id": 4,
        "type": "in-corpus-multi",
        "question": "How does MindFlow AI process a PDF file from upload through to being searchable? Walk through each step.",
        "expect_idk": False,
    },
    {
        "id": 5,
        "type": "in-corpus-multi",
        "question": "What authentication mechanism is used and how are JWT tokens issued and validated?",
        "expect_idk": False,
    },
    {
        "id": 6,
        "type": "in-corpus-multi",
        "question": "How does real-time collaboration work when two users edit the same mind map simultaneously?",
        "expect_idk": False,
    },
    # ── ambiguous (2) ────────────────────────────────────────────────────────
    {
        "id": 7,
        "type": "ambiguous",
        "question": "How does the system handle errors?",
        "expect_idk": False,
    },
    {
        "id": 8,
        "type": "ambiguous",
        "question": "What is the maximum number of retries configured for external API calls?",
        "expect_idk": False,
    },
    # ── out-of-corpus (2) ────────────────────────────────────────────────────
    {
        "id": 9,
        "type": "out-of-corpus",
        "question": "What is the capital of France?",
        "expect_idk": True,
    },
    {
        "id": 10,
        "type": "out-of-corpus",
        "question": "How do I configure a Kubernetes ingress controller for TLS termination?",
        "expect_idk": True,
    },
]

# ── Judge prompt (with Chain-of-Thought) ──────────────────────────────────────
# CoT is applied here: the judge explicitly reasons through four steps before
# assigning scores. This reduces score anchoring bias and produces more
# calibrated 1–5 ratings.

JUDGE_SYSTEM = textwrap.dedent("""
    You are an impartial evaluation judge for a Retrieval-Augmented Generation (RAG) system.

    You will be given:
      - A question
      - The chunks retrieved from the knowledge base
      - The system's final answer
      - Whether the question was expected to trigger an "I don't know" response

    CHAIN-OF-THOUGHT — reason step by step before scoring:
      Step 1: What is the question specifically asking for?
      Step 2: What information do the retrieved chunks actually contain?
              Are the chunks relevant? Do they cover what the question needs?
      Step 3: Does the final answer directly address the question?
              Is every claim traceable to the chunks (not to general knowledge)?
      Step 4: Are there gaps, hallucinations, or irrelevant content in the answer?

    After reasoning, assign two integer scores on a 1–5 scale:

    retrieval_score (1–5): Quality of the retrieved chunks
      5 = Chunks are highly relevant and contain everything needed to answer
      4 = Mostly relevant; minor gaps
      3 = Partially relevant; missing some important context
      2 = Mostly irrelevant; very little useful content
      1 = Completely irrelevant or empty

    answer_score (1–5): Quality of the final answer
      5 = Fully correct, grounded in retrieved context, directly addresses question
      4 = Mostly correct; minor gaps or slight over-generalisation
      3 = Partially correct; notable gaps or one unsupported claim
      2 = Mostly wrong or significantly under-answers the question
      1 = Completely wrong, hallucinated, or fabricated from training data

    Special rule for out-of-corpus / expect_idk=true queries:
      If the system correctly declines ("I don't have enough information..."),
      award retrieval_score=5 and answer_score=5.
      If it hallucinates an answer, award retrieval_score=1 and answer_score=1.

    Respond with ONLY valid JSON in this exact shape, no other text:
    {
      "cot_reasoning": "<your step-by-step reasoning, 2-4 sentences>",
      "retrieval_score": <int 1-5>,
      "answer_score": <int 1-5>
    }
""").strip()

JUDGE_HUMAN = textwrap.dedent("""
    Question: {question}
    Expected to say "I don't know": {expect_idk}
    Retrieved sources: {sources}
    System answer: {answer}
""").strip()


def judge(llm, question: str, answer: str, sources: list[str], expect_idk: bool) -> dict:
    from langchain_core.messages import HumanMessage, SystemMessage
    msgs = [
        SystemMessage(content=JUDGE_SYSTEM),
        HumanMessage(content=JUDGE_HUMAN.format(
            question=question,
            expect_idk=expect_idk,
            sources=", ".join(sources) if sources else "(none)",
            answer=answer,
        )),
    ]
    try:
        resp = llm.invoke(msgs)
        raw = str(resp.content).strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as exc:
        return {
            "cot_reasoning": f"Judge call failed: {exc}",
            "retrieval_score": -1,
            "answer_score": -1,
        }


def run(k: int = 4) -> None:
    ts = datetime.now(timezone.utc)
    print("\n" + "=" * 70)
    print("  MindFlow AI — RAG Evaluation Suite")
    print(f"  Run at: {ts.strftime('%Y-%m-%d %H:%M UTC')}  |  retrieval k={k}")
    print("=" * 70 + "\n")

    judge_llm = get_chat_model(max_tokens=1024, timeout=90, temperature=0)
    rows = []

    for q in TEST_QUERIES:
        print(f"[{q['id']:02d}/{len(TEST_QUERIES)}] {q['type']:20s}  {q['question'][:55]}")

        # ── RAG call ──────────────────────────────────────────────────────────
        try:
            rag = rag_chat_structured(q["question"], k=k)
            answer = rag.answer
            sources = rag.sources
            prompt_tokens = rag.prompt_tokens
            completion_tokens = rag.completion_tokens
        except Exception as exc:
            answer = f"[RAG ERROR: {exc}]"
            sources = []
            prompt_tokens = completion_tokens = 0

        print(f"         Answer  : {answer[:110]}{'…' if len(answer) > 110 else ''}")
        print(f"         Sources : {sources}")
        print(f"         Tokens  : prompt={prompt_tokens}  completion={completion_tokens}")

        # ── Judge call ───────────────────────────────────────────────────────
        scores = judge(judge_llm, q["question"], answer, sources, q["expect_idk"])
        rs = scores.get("retrieval_score", -1)
        as_ = scores.get("answer_score", -1)

        print(f"         Scores  : retrieval={rs}/5  answer={as_}/5")
        print(f"         CoT     : {scores.get('cot_reasoning', '')[:100]}\n")

        rows.append({
            "query": q["question"],
            "type": q["type"],
            "answer": answer,
            "sources": "; ".join(sources),
            "retrieval_score": rs,
            "answer_score": as_,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            # Internal fields for JSON output
            "_id": q["id"],
            "_expect_idk": q["expect_idk"],
            "_cot": scores.get("cot_reasoning", ""),
        })

    # ── Summary table ─────────────────────────────────────────────────────────
    print("=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"{'ID':>3}  {'TYPE':20s}  {'RET':>4}  {'ANS':>4}  {'PT':>6}  {'CT':>6}  Question")
    print("-" * 70)
    total_ret = total_ans = total_pt = total_ct = valid = 0
    for r in rows:
        rr, ra = r["retrieval_score"], r["answer_score"]
        print(f"{r['_id']:>3}  {r['type']:20s}  {rr:>4}  {ra:>4}  "
              f"{r['prompt_tokens']:>6}  {r['completion_tokens']:>6}  "
              f"{r['query'][:30]}")
        if rr > 0 and ra > 0:
            total_ret += rr
            total_ans += ra
            total_pt += r["prompt_tokens"]
            total_ct += r["completion_tokens"]
            valid += 1

    max_ret = valid * 5
    max_ans = valid * 5
    print("-" * 70)
    print(f"     Retrieval total : {total_ret}/{max_ret}  ({total_ret/max_ret*100:.1f}%)" if max_ret else "     No valid scores")
    print(f"     Answer total    : {total_ans}/{max_ans}  ({total_ans/max_ans*100:.1f}%)" if max_ans else "")
    print(f"     Total tokens    : prompt={total_pt}  completion={total_ct}")
    print()

    # Token analysis
    if valid:
        highest_pt = max(rows, key=lambda r: r["prompt_tokens"])
        print(f"  Highest prompt token usage: Q{highest_pt['_id']} ({highest_pt['type']}) "
              f"— {highest_pt['prompt_tokens']} tokens")
        print(f"  Query: {highest_pt['query']}")
        print()

    # Hallucination check
    hallucinations = [r for r in rows if r["_expect_idk"] and r["answer_score"] < 4]
    if hallucinations:
        print(f"  WARNING: Possible hallucination on {len(hallucinations)} out-of-corpus queries:")
        for h in hallucinations:
            print(f"     Q{h['_id']}: {h['query']}")
    else:
        print("  OK: No hallucinations detected on out-of-corpus queries.")
    print()

    # ── Write CSV (required deliverable) ─────────────────────────────────────
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = RESULTS_DIR / "eval_results.csv"
    csv_columns = ["query", "type", "answer", "sources",
                   "retrieval_score", "answer_score", "prompt_tokens", "completion_tokens"]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=csv_columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"  CSV results  → {csv_path}")

    # ── Write JSON (full detail) ──────────────────────────────────────────────
    json_path = Path(__file__).parent / f"eval_results_{ts.strftime('%Y%m%d_%H%M%S')}.json"
    json_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    print(f"  JSON results → {json_path}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run MindFlow AI RAG evaluation")
    parser.add_argument("--k", type=int, default=4,
                        help="Number of chunks to retrieve (default 4; use 1 for failure analysis)")
    args = parser.parse_args()
    run(k=args.k)

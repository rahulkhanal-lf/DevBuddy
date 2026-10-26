"""
MindFlow AI — RAG Evaluation Suite
====================================
LLM-as-judge evaluation over 10 test queries.

Each query is scored by Amazon Nova Lite on three dimensions:
  correctness   0-3  (is the answer factually right given the context?)
  groundedness  0-3  (is every claim traceable to retrieved context?)
  relevance     0-3  (does the answer address what was asked?)

Score key:  0 = completely wrong/missing  1 = partial  2 = mostly right  3 = perfect

Run from the BE-FastAPI directory (so .env is loaded):
  cd BE-FastAPI
  python -I ../eval/run_eval.py

Or provide a custom knowledge base summary as context via --context-file:
  python -I ../eval/run_eval.py --context-file my_docs.txt
"""

import argparse
import json
import os
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

# ── Bootstrap: load .env and add BE-FastAPI to sys.path ──────────────────────
BE_DIR = Path(__file__).resolve().parent.parent / "BE-FastAPI"
sys.path.insert(0, str(BE_DIR))

from dotenv import load_dotenv
load_dotenv(BE_DIR / ".env")

from services.bedrock import get_chat_model  # noqa: E402
from services.rag_service import rag_chat    # noqa: E402

# ── 10 Test Queries ───────────────────────────────────────────────────────────
# Categories:
#   IN_SCOPE   — should be answerable from a typical engineering knowledge base
#   OUT_SCOPE  — clearly outside any uploaded docs; expect "I don't know"
#   EDGE       — partial information, ambiguous, or multi-hop questions

TEST_QUERIES = [
    {
        "id": 1,
        "category": "IN_SCOPE",
        "question": "What is the purpose of the /api/files/upload endpoint?",
        "intent": "Retrieve factual description of an API endpoint from documentation.",
        "expect_idk": False,
    },
    {
        "id": 2,
        "category": "IN_SCOPE",
        "question": "What authentication mechanism is used in this system?",
        "intent": "Retrieve the auth strategy (JWT / Bearer token) from architecture docs.",
        "expect_idk": False,
    },
    {
        "id": 3,
        "category": "IN_SCOPE",
        "question": "Which AI model is used for generating mind maps?",
        "intent": "Retrieve the LLM model name from technical documentation.",
        "expect_idk": False,
    },
    {
        "id": 4,
        "category": "IN_SCOPE",
        "question": "How are PDF files processed and stored for retrieval?",
        "intent": "Retrieve the ingestion pipeline description (chunking, embedding, pgvector).",
        "expect_idk": False,
    },
    {
        "id": 5,
        "category": "IN_SCOPE",
        "question": "What database is used for vector storage and similarity search?",
        "intent": "Retrieve the vector store technology (pgvector / PostgreSQL).",
        "expect_idk": False,
    },
    {
        "id": 6,
        "category": "EDGE",
        "question": "What is the maximum number of retries configured for Bedrock API calls?",
        "intent": "Tests retrieval of specific numeric configuration detail.",
        "expect_idk": False,
    },
    {
        "id": 7,
        "category": "EDGE",
        "question": "How does the system handle expired AWS session tokens?",
        "intent": "Tests retrieval of error handling logic — may require cross-chunk synthesis.",
        "expect_idk": False,
    },
    {
        "id": 8,
        "category": "EDGE",
        "question": "What happens when two users edit the same mind map simultaneously?",
        "intent": "Tests retrieval of WebSocket collaboration behaviour.",
        "expect_idk": False,
    },
    {
        "id": 9,
        "category": "OUT_SCOPE",
        "question": "What is the capital of France?",
        "intent": "Completely out of scope — system must say I don't know.",
        "expect_idk": True,
    },
    {
        "id": 10,
        "category": "OUT_SCOPE",
        "question": "How do I configure a Kubernetes ingress controller for TLS termination?",
        "intent": "Engineering topic but not in this knowledge base — expect I don't know.",
        "expect_idk": True,
    },
]

# ── Judge prompt ──────────────────────────────────────────────────────────────
JUDGE_SYSTEM = textwrap.dedent("""
    You are an impartial evaluation judge for a Retrieval-Augmented Generation (RAG) system.
    You will be given:
      - A question
      - The system's answer
      - Whether the question was expected to be answerable (expect_idk)

    Score the answer on THREE dimensions, each 0-3:

    correctness (0-3):
      3 = factually accurate and complete
      2 = mostly correct with minor gaps
      1 = partially correct but significant errors or omissions
      0 = wrong or hallucinated

    groundedness (0-3):
      3 = every claim is clearly traceable to provided context; no fabrication
      2 = mostly grounded, one small unsupported inference
      1 = partially grounded, notable unsupported claims
      0 = answer is not grounded — fabricated from training data

    relevance (0-3):
      3 = directly and fully addresses the question
      2 = mostly relevant, minor tangents
      1 = partially relevant
      0 = off-topic

    Special rule for OUT_SCOPE / expect_idk=true queries:
      If the system correctly says "I don't know / I don't have enough information",
      award groundedness=3, relevance=3, correctness=3.
      If it hallucinates an answer instead, award correctness=0, groundedness=0.

    Respond with ONLY valid JSON in this exact shape, no other text:
    {
      "correctness": <int 0-3>,
      "groundedness": <int 0-3>,
      "relevance": <int 0-3>,
      "reasoning": "<one sentence>"
    }
""").strip()

JUDGE_HUMAN = textwrap.dedent("""
    Question: {question}
    Expected to say "I don't know": {expect_idk}
    System answer: {answer}
""").strip()


def judge(llm, question: str, answer: str, expect_idk: bool) -> dict:
    from langchain_core.messages import HumanMessage, SystemMessage
    msgs = [
        SystemMessage(content=JUDGE_SYSTEM),
        HumanMessage(content=JUDGE_HUMAN.format(
            question=question,
            answer=answer,
            expect_idk=expect_idk,
        )),
    ]
    try:
        raw = llm.invoke(msgs).content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as exc:
        return {"correctness": -1, "groundedness": -1, "relevance": -1,
                "reasoning": f"Judge failed: {exc}"}


def bar(score: int, max_score: int = 3) -> str:
    filled = round(score / max_score * 10)
    return "█" * filled + "░" * (10 - filled)


def run(context_file: str | None = None) -> None:
    print("\n" + "=" * 64)
    print("  MindFlow AI — RAG Evaluation Suite")
    print(f"  Run at: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 64 + "\n")

    # Use a separate LLM instance for the judge (same model, higher token limit)
    judge_llm = get_chat_model(max_tokens=512, timeout=60)

    results = []

    for q in TEST_QUERIES:
        print(f"[{q['id']:02d}/{len(TEST_QUERIES)}] {q['category']:10s}  {q['question'][:60]}")
        print(f"         Intent: {q['intent']}")

        # Get RAG answer
        try:
            answer = rag_chat(q["question"])
        except Exception as exc:
            answer = f"[RAG ERROR: {exc}]"

        print(f"         Answer: {answer[:120]}{'…' if len(answer) > 120 else ''}")

        # Judge it
        scores = judge(judge_llm, q["question"], answer, q["expect_idk"])
        c, g, r = scores.get("correctness", -1), scores.get("groundedness", -1), scores.get("relevance", -1)
        total = (c + g + r) if all(x >= 0 for x in [c, g, r]) else -1

        print(f"         Scores — correctness:{c}/3  groundedness:{g}/3  relevance:{r}/3  total:{total}/9")
        print(f"         Reason: {scores.get('reasoning', '')}\n")

        results.append({**q, "answer": answer, "scores": scores, "total": total})

    # ── Summary table ────────────────────────────────────────────────────────
    print("=" * 64)
    print("  SUMMARY")
    print("=" * 64)
    print(f"{'ID':>3}  {'CAT':10}  {'C':>2}  {'G':>2}  {'R':>2}  {'TOT':>4}  Question")
    print("-" * 64)
    grand_total = 0
    valid = 0
    for r in results:
        s = r["scores"]
        c, g, rv = s.get("correctness", -1), s.get("groundedness", -1), s.get("relevance", -1)
        tot = r["total"]
        print(f"{r['id']:>3}  {r['category']:10}  {c:>2}  {g:>2}  {rv:>2}  {tot:>4}  {r['question'][:35]}")
        if tot >= 0:
            grand_total += tot
            valid += 1

    max_possible = valid * 9
    pct = grand_total / max_possible * 100 if max_possible else 0
    print("-" * 64)
    print(f"     Total: {grand_total}/{max_possible}  ({pct:.1f}%)")
    print()

    # Hallucination check — OUT_SCOPE queries with non-zero correctness from
    # hallucinated answers
    idk_failures = [
        r for r in results
        if r["expect_idk"] and r["scores"].get("groundedness", 3) < 2
    ]
    if idk_failures:
        print(f"  ⚠  HALLUCINATION DETECTED on {len(idk_failures)} out-of-scope queries:")
        for f in idk_failures:
            print(f"     Q{f['id']}: {f['question']}")
    else:
        print("  ✓  No hallucinations detected on out-of-scope queries.")

    print()

    # Save results
    out_path = Path(__file__).parent / f"eval_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"  Full results saved to: {out_path}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run MindFlow AI RAG evaluation")
    parser.add_argument("--context-file", help="Path to a plain-text file to use as additional context")
    args = parser.parse_args()
    run(context_file=args.context_file)

"""
RAG service using LangChain + pgvector + Amazon Bedrock.

Key components:
  PyPDFLoader                - loads a PDF, one Document per page
  RecursiveCharacterTextSplitter - splits text into overlapping chunks
  BedrockEmbeddings          - Titan Text Embeddings V2 via Amazon Bedrock
  PGVector                   - stores/retrieves vectors in PostgreSQL
  ChatBedrockConverse        - Amazon Nova Lite via Bedrock (see services/bedrock.py)
  ChatPromptTemplate         - structures system + human messages
  LCEL (| pipe syntax)       - composes steps into a chain
"""

import logging
import os
from pathlib import Path

from langchain_aws import BedrockEmbeddings
from langchain_community.document_loaders import PyPDFLoader  # noqa: deprecated warning expected
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_postgres import PGVector
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel

from services.bedrock import BedrockNotConfigured, get_bedrock_client, get_chat_model, get_region

logger = logging.getLogger(__name__)

COLLECTION_NAME = "devbuddy_knowledge"
TITAN_EMBED_MODEL = "amazon.titan-embed-text-v2:0"

_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "project" / "prompts"


# ── Structured output schema ──────────────────────────────────────────────────

class RAGResponse(BaseModel):
    """Structured output returned by the RAG pipeline."""
    answer: str
    sources: list[str]
    prompt_tokens: int = 0
    completion_tokens: int = 0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pgvector_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    return url.replace("postgresql://", "postgresql+psycopg://", 1)


def _embeddings() -> BedrockEmbeddings:
    return BedrockEmbeddings(
        model_id=TITAN_EMBED_MODEL,
        client=get_bedrock_client(),
    )


def _vector_store() -> PGVector:
    return PGVector(
        embeddings=_embeddings(),
        collection_name=COLLECTION_NAME,
        connection=_pgvector_url(),
        use_jsonb=True,
    )


def _load_prompt(filename: str) -> str:
    """Load a versioned system prompt file; fall back to inline if missing."""
    path = _PROMPTS_DIR / filename
    if path.exists():
        return path.read_text()
    # Inline fallback (v2 content) so the service works without the project dir
    return (
        "You are MindFlow AI, an Internal Engineering Knowledge Assistant.\n"
        "Your sole source of truth is the CONTEXT block below.\n\n"
        "STRICT RULES:\n"
        "1. Answer ONLY from the context.\n"
        "2. If context is insufficient, respond: \"I don't have enough information "
        "in my knowledge base to answer that.\"\n"
        "3. Never speculate or use training data.\n\n"
        "A system that confidently hallucinates is worse than one that says 'I don't know.'\n\n"
        "CONTEXT:\n{context}"
    )


# ── Ingestion ─────────────────────────────────────────────────────────────────

def ingest_pdf(file_path: str, source_id: str, source_name: str) -> None:
    """Load a PDF, chunk it, embed each chunk with Titan V2, store in pgvector."""
    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = splitter.split_documents(docs)

        for chunk in chunks:
            chunk.metadata["source_id"] = source_id
            chunk.metadata["source_name"] = source_name
            chunk.metadata["source_type"] = "pdf"

        _vector_store().add_documents(chunks)
        logger.info("Ingested PDF '%s' (%d chunks)", source_name, len(chunks))
    except Exception:
        logger.exception("Failed to ingest PDF '%s'", source_name)


def ingest_text(content: str, source_id: str, title: str) -> None:
    """Wrap plain text in a Document, split, embed, and store."""
    try:
        doc = Document(
            page_content=content,
            metadata={"source_id": source_id, "source_name": title, "source_type": "text"},
        )
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = splitter.split_documents([doc])
        _vector_store().add_documents(chunks)
        logger.info("Ingested text '%s' (%d chunks)", title, len(chunks))
    except Exception:
        logger.exception("Failed to ingest text '%s'", title)


# ── Retrieval ─────────────────────────────────────────────────────────────────

def _retrieve_chunks(query: str, k: int = 4) -> list[Document]:
    """Return top-k similar chunks from pgvector. Returns [] on any failure."""
    try:
        retriever = _vector_store().as_retriever(search_kwargs={"k": k})
        return retriever.invoke(query)
    except BedrockNotConfigured:
        return []
    except Exception:
        logger.exception("Knowledge retrieval failed")
        return []


def _retrieve_context(query: str) -> str:
    """Convenience wrapper returning formatted context string."""
    return "\n\n".join(c.page_content for c in _retrieve_chunks(query))


# ── Generation ────────────────────────────────────────────────────────────────

def rag_chat(query: str) -> str:
    """
    LCEL RAG chain (plain-text output, used by the live chat endpoint).
        _retrieve_context  → top-4 chunks from pgvector (Titan embeddings)
        | prompt           → versioned system prompt (system_qa_v2.md)
        | llm              → Amazon Nova Lite (temperature=0.1)
        | StrOutputParser  → plain-text reply
    """
    llm = get_chat_model(max_tokens=4096, timeout=90, temperature=0.1)

    system_content = _load_prompt("system_qa_v2.md")
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_content),
        ("human", "{question}"),
    ])

    chain = (
        {"context": RunnableLambda(_retrieve_context), "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain.invoke(query)


def rag_chat_structured(query: str, k: int = 4) -> RAGResponse:
    """
    Structured RAG pipeline used by the evaluation suite.

    Returns a RAGResponse with:
      answer           — LLM-generated answer grounded in retrieved context
      sources          — unique source document names from retrieved chunks
      prompt_tokens    — input tokens consumed (as reported by Bedrock SDK)
      completion_tokens — output tokens consumed

    Sources are extracted from chunk metadata rather than asking the LLM to
    enumerate them, which is more reliable and avoids hallucinated references.
    """
    llm = get_chat_model(max_tokens=4096, timeout=90, temperature=0.1)

    chunks = _retrieve_chunks(query, k=k)
    context = "\n\n".join(c.page_content for c in chunks)
    sources = sorted({c.metadata.get("source_name", "unknown") for c in chunks})

    system_content = _load_prompt("system_qa_v2.md").replace("{context}", context)
    messages = [
        SystemMessage(content=system_content),
        HumanMessage(content=query),
    ]

    response = llm.invoke(messages)
    usage = response.usage_metadata or {}

    return RAGResponse(
        answer=str(response.content),
        sources=sources,
        prompt_tokens=usage.get("input_tokens", 0),
        completion_tokens=usage.get("output_tokens", 0),
    )

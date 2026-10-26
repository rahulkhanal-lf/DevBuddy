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

from langchain_aws import BedrockEmbeddings
from langchain_community.document_loaders import PyPDFLoader  # noqa: deprecated warning expected
from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_postgres import PGVector
from langchain_text_splitters import RecursiveCharacterTextSplitter

from services.bedrock import BedrockNotConfigured, get_bedrock_client, get_chat_model, get_region

logger = logging.getLogger(__name__)

COLLECTION_NAME = "devbuddy_knowledge"
TITAN_EMBED_MODEL = "amazon.titan-embed-text-v2:0"


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


# ── Retrieval + Generation ────────────────────────────────────────────────────

def _format_docs(docs: list[Document]) -> str:
    return "\n\n".join(doc.page_content for doc in docs)


def _retrieve_context(query: str) -> str:
    """Top-4 similar chunks from pgvector using Titan embeddings. Returns '' on any failure."""
    try:
        retriever = _vector_store().as_retriever(search_kwargs={"k": 4})
        return _format_docs(retriever.invoke(query))
    except BedrockNotConfigured:
        return ""
    except Exception:
        logger.exception("Knowledge retrieval failed; answering without context")
        return ""


def rag_chat(query: str) -> str:
    """
    LCEL RAG chain:
        _retrieve_context  → top-4 chunks from pgvector (Titan embeddings)
        | prompt           → system + human messages
        | llm              → Amazon Nova Lite via Bedrock
        | StrOutputParser  → plain-text reply
    """
    llm = get_chat_model(max_tokens=4096, timeout=90)

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are MindFlow AI, an Internal Engineering Knowledge Assistant.\n"
            "Your sole source of truth is the CONTEXT block below, retrieved from the user's knowledge base.\n\n"
            "STRICT RULES — follow every one, always:\n"
            "1. Answer ONLY from information explicitly present in the context.\n"
            "2. If the context is empty, or does not contain sufficient information to answer "
            "the question, you MUST respond with exactly:\n"
            "   \"I don't have enough information in my knowledge base to answer that. "
            "Try uploading relevant documents or adding notes and ask again.\"\n"
            "   Do NOT attempt to answer from general knowledge or training data.\n"
            "3. Never speculate, infer beyond what the context states, or fill gaps with assumptions.\n"
            "4. If you are partially confident, state exactly which part of your answer comes from "
            "the context and flag what is uncertain.\n"
            "5. Cite the source document name when it is available in the context metadata.\n\n"
            "A system that confidently hallucinates is worse than one that says 'I don't know.'\n\n"
            "CONTEXT:\n{context}",
        ),
        ("human", "{question}"),
    ])

    chain = (
        {"context": RunnableLambda(_retrieve_context), "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain.invoke(query)

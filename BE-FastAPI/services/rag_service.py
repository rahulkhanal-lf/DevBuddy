"""
RAG service using LangChain 1.x + pgvector.

Key LangChain concepts:
  Document              - the core data unit (text + metadata dict)
  PyPDFLoader           - loads a PDF, one Document per page
  RecursiveCharacterTextSplitter - splits long text into overlapping chunks
  OpenAIEmbeddings      - converts text to a float vector
  PGVector              - stores/retrieves vectors in PostgreSQL
  ChatOpenAI            - calls the OpenAI chat model
  ChatPromptTemplate    - structures system + human messages
  LCEL (| pipe syntax)  - composes steps into a chain:
                          retriever | format | prompt | llm | parser
"""

import os
import logging

from langchain_community.document_loaders import PyPDFLoader  # noqa: deprecated warning expected
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_postgres import PGVector
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

COLLECTION_NAME = "devbuddy_knowledge"


def _pgvector_url() -> str:
    """langchain-postgres needs postgresql+psycopg:// (psycopg v3 driver)."""
    url = os.getenv("DATABASE_URL", "")
    return url.replace("postgresql://", "postgresql+psycopg://", 1)


def _embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(model="text-embedding-3-small")


def _vector_store() -> PGVector:
    return PGVector(
        embeddings=_embeddings(),
        collection_name=COLLECTION_NAME,
        connection=_pgvector_url(),
        use_jsonb=True,
    )


# ── Ingestion ─────────────────────────────────────────────────────────────────

def ingest_pdf(file_path: str, source_id: str, source_name: str) -> None:
    """Load a PDF, chunk it, embed each chunk, store in pgvector."""
    try:
        # 1. Load — PyPDFLoader gives one Document per PDF page
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        # 2. Split — RecursiveCharacterTextSplitter tries paragraph → sentence
        #    → word boundaries to keep semantic units intact
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = splitter.split_documents(docs)

        # 3. Tag — store source metadata so we can trace which file each chunk came from
        for chunk in chunks:
            chunk.metadata["source_id"] = source_id
            chunk.metadata["source_name"] = source_name
            chunk.metadata["source_type"] = "pdf"

        # 4. Embed + store — OpenAI turns each chunk into a vector, PGVector stores it
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
    """Join retrieved chunks into a single context string for the prompt."""
    return "\n\n".join(doc.page_content for doc in docs)


def rag_chat(query: str) -> str:
    """
    LCEL (LangChain Expression Language) RAG chain:

        retriever          → finds top-4 similar chunks from pgvector
        | _format_docs     → joins them into one context string
        | prompt           → inserts context + query into the chat template
        | llm              → calls GPT-4o-mini
        | StrOutputParser  → extracts the plain-text reply
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
    retriever = _vector_store().as_retriever(search_kwargs={"k": 4})

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are DevBuddy, a helpful AI assistant for developers.\n"
            "Use the context below (from the knowledge base) to answer.\n"
            "If the context is not relevant, answer from your own knowledge.\n\n"
            "Context:\n{context}",
        ),
        ("human", "{question}"),
    ])

    # LCEL pipe: each step's output becomes the next step's input
    chain = (
        {"context": retriever | _format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain.invoke(query)

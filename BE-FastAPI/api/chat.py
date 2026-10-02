from uuid import uuid4
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Conversation, Message
from schemas import ChatRequest, ChatResponse
from services import rag_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == payload.conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Persist the user message first
    user_msg = Message(
        id=str(uuid4()),
        conversation_id=payload.conversation_id,
        role="user",
        content=payload.message,
        created_at=datetime.utcnow(),
    )
    db.add(user_msg)
    db.commit()

    # Run RAG: retrieve relevant chunks from pgvector, inject into prompt, call LLM
    answer = rag_chat(payload.message)

    # Persist the assistant reply
    assistant_msg = Message(
        id=str(uuid4()),
        conversation_id=payload.conversation_id,
        role="assistant",
        content=answer,
        created_at=datetime.utcnow(),
    )
    db.add(assistant_msg)
    db.commit()

    return ChatResponse(
        conversation_id=payload.conversation_id,
        message=answer,
        message_id=assistant_msg.id,
    )

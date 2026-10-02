from uuid import uuid4
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import KnowledgeText
from schemas import KnowledgeCreate, KnowledgeResponse
from services import ingest_text

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("", response_model=KnowledgeResponse)
def create_knowledge(
    payload: KnowledgeCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    db_knowledge = KnowledgeText(
        id=str(uuid4()),
        title=payload.title,
        content=payload.content,
        created_at=datetime.utcnow(),
    )
    db.add(db_knowledge)
    db.commit()
    db.refresh(db_knowledge)

    background_tasks.add_task(ingest_text, payload.content, db_knowledge.id, payload.title)

    return db_knowledge


@router.get("", response_model=list[KnowledgeResponse])
def get_all_knowledge(db: Session = Depends(get_db)):
    return db.query(KnowledgeText).order_by(KnowledgeText.created_at.desc()).all()


@router.get("/{knowledge_id}", response_model=KnowledgeResponse)
def get_knowledge(knowledge_id: str, db: Session = Depends(get_db)):
    item = db.query(KnowledgeText).filter(KnowledgeText.id == knowledge_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    return item


@router.delete("/{knowledge_id}")
def delete_knowledge(knowledge_id: str, db: Session = Depends(get_db)):
    item = db.query(KnowledgeText).filter(KnowledgeText.id == knowledge_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    db.delete(item)
    db.commit()
    return {"message": "Knowledge deleted"}

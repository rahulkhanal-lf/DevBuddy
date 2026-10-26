from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import KnowledgeText
from models.user import User
from schemas import KnowledgeCreate, KnowledgeResponse
from services import ingest_text
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("", response_model=KnowledgeResponse)
def create_knowledge(
    payload: KnowledgeCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_knowledge = KnowledgeText(
        title=payload.title,
        content=payload.content,
        user_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(db_knowledge)
    db.commit()
    db.refresh(db_knowledge)

    background_tasks.add_task(ingest_text, payload.content, db_knowledge.id, payload.title)

    return db_knowledge


@router.get("", response_model=list[KnowledgeResponse])
def get_all_knowledge(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(KnowledgeText)
        .filter(KnowledgeText.user_id == current_user.id)
        .order_by(KnowledgeText.created_at.desc())
        .all()
    )


@router.get("/{knowledge_id}", response_model=KnowledgeResponse)
def get_knowledge(knowledge_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = (
        db.query(KnowledgeText)
        .filter(KnowledgeText.id == knowledge_id, KnowledgeText.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    return item


@router.delete("/{knowledge_id}")
def delete_knowledge(knowledge_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = (
        db.query(KnowledgeText)
        .filter(KnowledgeText.id == knowledge_id, KnowledgeText.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    db.delete(item)
    db.commit()
    return {"message": "Knowledge deleted"}

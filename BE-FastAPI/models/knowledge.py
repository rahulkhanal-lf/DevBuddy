from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from database import Base


class KnowledgeText(Base):
    __tablename__ = "knowledge_texts"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

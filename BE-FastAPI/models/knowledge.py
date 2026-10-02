from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from database import Base


class KnowledgeText(Base):
    __tablename__ = "knowledge_texts"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

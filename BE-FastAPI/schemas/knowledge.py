from datetime import datetime
from pydantic import BaseModel


class KnowledgeCreate(BaseModel):
    title: str
    content: str


class KnowledgeResponse(BaseModel):
    id: str
    title: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

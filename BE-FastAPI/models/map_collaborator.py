from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from database import Base


class MapCollaborator(Base):
    __tablename__ = "map_collaborators"

    id = Column(String(36), primary_key=True)
    map_id = Column(String(36), ForeignKey("mind_maps.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), default="editor")
    added_at = Column(DateTime, default=datetime.utcnow)

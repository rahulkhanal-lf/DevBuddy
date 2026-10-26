from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from database import Base


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String(36), primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_type = Column(String(100), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

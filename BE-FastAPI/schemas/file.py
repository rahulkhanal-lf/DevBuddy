from datetime import datetime
from pydantic import BaseModel


class FileResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    file_size: int
    file_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True

import os
from uuid import uuid4
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import UploadedFile
from schemas import FileResponse
from services import ingest_pdf

router = APIRouter(prefix="/api/files", tags=["files"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_TYPES = {"application/pdf"}
ALLOWED_EXTENSIONS = {".pdf"}


@router.post("/upload", response_model=FileResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS or file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    if file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    file_id = str(uuid4())
    file_ext = os.path.splitext(file.filename)[1].lower()
    stored_filename = f"{file_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    db_file = UploadedFile(
        id=file_id,
        filename=stored_filename,
        original_name=file.filename,
        file_size=len(content),
        file_type=file.content_type or "application/octet-stream",
        uploaded_at=datetime.utcnow(),
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    # Kick off embedding in the background so the upload response is instant
    background_tasks.add_task(ingest_pdf, file_path, file_id, file.filename)

    return db_file


@router.get("", response_model=list[FileResponse])
def get_files(db: Session = Depends(get_db)):
    files = db.query(UploadedFile).order_by(UploadedFile.uploaded_at.desc()).all()
    return files


@router.get("/{file_id}", response_model=FileResponse)
def get_file(file_id: str, db: Session = Depends(get_db)):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    return db_file


@router.delete("/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db)):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, db_file.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(db_file)
    db.commit()
    return {"message": "File deleted"}

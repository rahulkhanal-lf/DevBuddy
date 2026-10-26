from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from database import get_db
from models.user import User
from services.auth_service import hash_password, verify_password, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _user_response(user: User, token: str) -> dict:
    return {
        "token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        id=str(uuid4()),
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id, user.name, user.email)
    return _user_response(user, token)


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.id, user.name, user.email)
    return _user_response(user, token)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}

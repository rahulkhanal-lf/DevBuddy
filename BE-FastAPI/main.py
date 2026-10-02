from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from api import files_router, conversations_router, messages_router, knowledge_router, chat_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="DevBuddy API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all route modules
app.include_router(files_router)
app.include_router(conversations_router)
app.include_router(messages_router)
app.include_router(knowledge_router)
app.include_router(chat_router)


@app.get("/")
def root():
    return {"message": "DevBuddy API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
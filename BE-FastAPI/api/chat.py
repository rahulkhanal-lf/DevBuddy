import logging
from uuid import uuid4
from datetime import datetime

from botocore.exceptions import ClientError, ConnectTimeoutError, EndpointConnectionError, NoCredentialsError, ReadTimeoutError
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Conversation, Message
from models.user import User
from schemas import ChatRequest, ChatResponse
from services import rag_chat
from services.auth_service import get_current_user
from services.bedrock import BedrockNotConfigured

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    conv = db.query(Conversation).filter(Conversation.id == payload.conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    user_msg = Message(
        id=str(uuid4()),
        conversation_id=payload.conversation_id,
        role="user",
        content=payload.message,
        created_at=datetime.utcnow(),
    )
    db.add(user_msg)
    db.commit()

    try:
        answer = rag_chat(payload.message)
    except BedrockNotConfigured:
        raise HTTPException(status_code=503, detail="Chat is not configured on the server (AWS credentials are missing).")
    except NoCredentialsError:
        logger.error("AWS credentials missing or invalid")
        raise HTTPException(status_code=503, detail="Chat is not configured on the server (AWS credentials are missing).")
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "ThrottlingException":
            raise HTTPException(status_code=429, detail="The AI service is busy right now. Please try again in a moment.")
        if code == "AccessDeniedException":
            logger.error("Bedrock access denied; check AWS credentials and IAM permissions")
            raise HTTPException(status_code=503, detail="The server's AWS credentials were rejected. Check AWS_ACCESS_KEY_ID and permissions.")
        if code in ("ModelTimeoutException", "RequestTimeout"):
            raise HTTPException(status_code=504, detail="The AI service took too long to respond. Please try again.")
        logger.exception("Bedrock ClientError %s", code)
        raise HTTPException(status_code=502, detail="Something went wrong while generating a reply. Please try again.")
    except (ConnectTimeoutError, EndpointConnectionError):
        raise HTTPException(status_code=503, detail="Could not reach the AI service.")
    except ReadTimeoutError:
        raise HTTPException(status_code=504, detail="The AI service took too long to respond. Please try again.")
    except Exception:
        logger.exception("Chat request failed")
        raise HTTPException(status_code=502, detail="Something went wrong while generating a reply. Please try again.")

    assistant_msg = Message(
        id=str(uuid4()),
        conversation_id=payload.conversation_id,
        role="assistant",
        content=answer,
        created_at=datetime.utcnow(),
    )
    db.add(assistant_msg)
    db.commit()

    return ChatResponse(
        conversation_id=payload.conversation_id,
        message=answer,
        message_id=assistant_msg.id,
    )

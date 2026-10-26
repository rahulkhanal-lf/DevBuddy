from .files import router as files_router
from .conversations import router as conversations_router
from .messages import router as messages_router
from .knowledge import router as knowledge_router
from .chat import router as chat_router
from .mindmaps import router as mindmaps_router
from .auth import router as auth_router

__all__ = ["files_router", "conversations_router", "messages_router", "knowledge_router", "chat_router", "mindmaps_router", "auth_router"]

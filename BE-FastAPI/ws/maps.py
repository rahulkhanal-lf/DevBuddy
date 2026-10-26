import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from ws.manager import manager
from services.auth_service import decode_token

router = APIRouter()


@router.websocket("/ws/maps/{map_id}")
async def map_ws(map_id: str, ws: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
    except Exception:
        await ws.close(code=1008)
        return

    user = {"id": payload["sub"], "name": payload["name"], "email": payload["email"]}
    await manager.connect(map_id, ws, user)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg["from"] = user["id"]
            await manager.broadcast(map_id, msg, exclude=ws)
    except WebSocketDisconnect:
        manager.disconnect(map_id, ws)
        await manager.broadcast(map_id, {"type": "presence", "users": manager.get_users(map_id)})

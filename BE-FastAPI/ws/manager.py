import json
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # map_id -> list of (websocket, user_info_dict)
        self.rooms: dict[str, list[tuple[WebSocket, dict]]] = {}

    async def connect(self, map_id: str, ws: WebSocket, user: dict):
        await ws.accept()
        if map_id not in self.rooms:
            self.rooms[map_id] = []
        self.rooms[map_id].append((ws, user))
        await self.broadcast(map_id, {"type": "presence", "users": self.get_users(map_id)})

    def disconnect(self, map_id: str, ws: WebSocket):
        if map_id in self.rooms:
            self.rooms[map_id] = [(w, u) for w, u in self.rooms[map_id] if w is not ws]
            if not self.rooms[map_id]:
                del self.rooms[map_id]

    def get_users(self, map_id: str) -> list:
        return [u for _, u in self.rooms.get(map_id, [])]

    async def broadcast(self, map_id: str, message: dict, exclude: WebSocket | None = None):
        if map_id not in self.rooms:
            return
        data = json.dumps(message)
        dead: list[WebSocket] = []
        for ws, _ in self.rooms[map_id]:
            if ws is exclude:
                continue
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(map_id, ws)


manager = ConnectionManager()

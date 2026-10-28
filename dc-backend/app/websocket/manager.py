from typing import Any, Dict, List, Tuple

from fastapi import WebSocket
from loguru import logger

class ConnectionManager:
    """Each connection belongs to one organization. Messages never cross organizations."""

    def __init__(self):
        self.active_connections: List[Tuple[WebSocket, str]] = []

    async def connect(self, websocket: WebSocket, scope: str):
        await websocket.accept()
        self.active_connections.append((websocket, scope))
        logger.info(f"WebSocket client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections = [(ws, s) for ws, s in self.active_connections if ws is not websocket]

    async def broadcast(self, message: Dict[str, Any], org_id: str):
        """Send to the connections of `org_id` only."""
        for ws, scope in list(self.active_connections):
            if scope != org_id:
                continue
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to WebSocket client: {e}")
                self.disconnect(ws)


ws_manager = ConnectionManager()

"""
WebSocket handler for real-time event broadcasting.

Endpoint: ws://localhost:8000/ws/live

Events broadcast:
  - pose_update        — skeleton positions
  - score_update       — score changes
  - target_update      — new target instructions
  - timer_update       — remaining time
  - session_start      — session started
  - session_end        — session ended
  - collision_detected — hand/foot touched a target
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """
    Manages active WebSocket connections and broadcasts events to all clients.
    """

    def __init__(self):
        self._connections: list[WebSocket] = []
        self._event_queue: asyncio.Queue = asyncio.Queue()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self._connections.append(websocket)
        logger.info(
            f"WebSocket client connected. Total: {len(self._connections)}"
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if websocket in self._connections:
            self._connections.remove(websocket)
        logger.info(
            f"WebSocket client disconnected. Total: {len(self._connections)}"
        )

    async def broadcast(self, event: str, data: dict) -> None:
        """
        Broadcast an event to all connected clients.

        Message format:
        {
            "event": "pose_update",
            "data": { ... }
        }
        """
        if not self._connections:
            return

        message = json.dumps({"event": event, "data": data})
        disconnected = []

        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

    def broadcast_sync(self, event: str, data: dict) -> None:
        """
        Thread-safe sync wrapper for broadcasting events.

        Called from the game engine thread. Puts the event in a queue
        that is consumed by the async broadcast loop.
        """
        try:
            self._event_queue.put_nowait((event, data))
        except asyncio.QueueFull:
            pass  # Drop events if queue is full (shouldn't happen)

    async def process_event_queue(self) -> None:
        """
        Background task that processes events from the sync queue
        and broadcasts them to WebSocket clients.
        """
        while True:
            try:
                event, data = await asyncio.wait_for(
                    self._event_queue.get(), timeout=0.05,
                )
                await self.broadcast(event, data)
            except asyncio.TimeoutError:
                await asyncio.sleep(0.01)
            except Exception as e:
                logger.error(f"Event queue processing error: {e}")
                await asyncio.sleep(0.1)

    @property
    def client_count(self) -> int:
        return len(self._connections)


# Global connection manager instance
ws_manager = ConnectionManager()


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """
    WebSocket endpoint for real-time live data.

    Clients connect to receive pose updates, score changes,
    and session events in real time.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; handle any incoming messages
            data = await websocket.receive_text()

            # Clients can send commands (e.g., ping)
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(
                        json.dumps({"event": "pong", "data": {}})
                    )
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

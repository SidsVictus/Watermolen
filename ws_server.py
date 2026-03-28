"""
ws_server.py
────────────
WebSocket server — bridges the Python agent loop to the React dashboard.

- Runs on ws://localhost:8765 (configurable via WS_PORT)
- Accepts connections from any client (the React app connects on load)
- Receives targetTemp / targetEnergy updates FROM the frontend
- Broadcasts the full sensor+agent payload TO the frontend every tick

Thread-safe: main.py calls broadcast() from the agent thread;
this module manages the asyncio event loop in its own thread.
"""

import asyncio
import json
import logging
import threading
from typing import Set

logger = logging.getLogger(__name__)

# ── Shared state ──────────────────────────────────────────────────────────────
_clients:    Set[object]          = set()
_loop:       asyncio.AbstractEventLoop | None = None
_lock:       threading.Lock       = threading.Lock()

# Operator targets — frontend can push updates here via WS message
target_temp:   float = 22.0
target_energy: float = 600.0


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def _handler(websocket):
    global target_temp, target_energy

    with _lock:
        _clients.add(websocket)
    logger.info(f"Client connected: {websocket.remote_address}  total={len(_clients)}")

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                # Frontend can send: {"type":"set_target","target_temp":24,"target_energy":700}
                if data.get("type") == "set_target":
                    if "target_temp" in data:
                        target_temp = float(data["target_temp"])
                        logger.info(f"Target temp updated → {target_temp}°C")
                    if "target_energy" in data:
                        target_energy = float(data["target_energy"])
                        logger.info(f"Target energy updated → {target_energy}W")
            except json.JSONDecodeError:
                pass
    except Exception:
        pass
    finally:
        with _lock:
            _clients.discard(websocket)
        logger.info(f"Client disconnected.  remaining={len(_clients)}")


async def _broadcast_async(payload: dict):
    """Send payload to all connected clients."""
    if not _clients:
        return
    message = json.dumps(payload)
    # Copy set to avoid mutation during iteration
    targets = list(_clients)
    results = await asyncio.gather(
        *[c.send(message) for c in targets],
        return_exceptions=True,
    )
    # Clean up dead connections
    for client, result in zip(targets, results):
        if isinstance(result, Exception):
            with _lock:
                _clients.discard(client)


def broadcast(payload: dict):
    """
    Thread-safe broadcast called from the main agent loop.
    Schedules the async send on the WS event loop.
    """
    global _loop
    if _loop is None:
        return
    asyncio.run_coroutine_threadsafe(_broadcast_async(payload), _loop)


# ── Server startup ────────────────────────────────────────────────────────────

def start_server(port: int = 8765):
    """
    Blocking call — run this in a daemon thread from main.py.
    Sets up the asyncio event loop and starts the websockets server.
    """
    global _loop

    import websockets

    async def _serve():
        global _loop
        _loop = asyncio.get_running_loop()
        logger.info(f"WS server listening on ws://0.0.0.0:{port}")
        async with websockets.serve(_handler, "0.0.0.0", port):
            await asyncio.Future()   # run forever

    asyncio.run(_serve())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    start_server(8765)

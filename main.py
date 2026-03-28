"""
main.py
───────
Orchestrator — runs the full agent loop every 5 seconds.

Pipeline (matches architecture diagram):
  scraper.py     → outdoor weather
  environment.py → indoor temp after applying last action
  main.py        → builds state vector
  memory.py      → fetches last 5 decisions
  controller.py  → LLM decides next action + reason
  actuator.py    → converts action → power numbers
  evaluator.py   → scores outcome → reward
  memory.py      → saves everything
  ws_server.py   → pushes full payload to React dashboard

Run:
  python main.py

Environment variables (set in .env or shell):
  ANTHROPIC_API_KEY   – for Claude controller (optional, rule engine fallback)
  BRIGHTDATA_API_KEY  – for BrightData scraper (optional)
  BRIGHTDATA_DATASET_ID
  OWM_API_KEY         – OpenWeatherMap fallback (optional)
  WS_PORT             – WebSocket port (default 8765)
  TARGET_TEMP         – operator target in °C (default 22.0)
  TICK_INTERVAL       – seconds between ticks (default 5)
"""

import os
import time
import json
import asyncio
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from scraper     import fetch_weather
from environment import Environment
from memory      import get_memory
from controller  import decide
from actuator    import actuate
from evaluator   import evaluate
import ws_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")

# ── Config ────────────────────────────────────────────────────────────────────
TARGET_TEMP    = float(os.getenv("TARGET_TEMP",    "22.0"))
TICK_INTERVAL  = float(os.getenv("TICK_INTERVAL",  "5.0"))
WS_PORT        = int(os.getenv("WS_PORT",          "8765"))

# How often to refresh outdoor weather (every N ticks ≈ every 5 min by default)
WEATHER_REFRESH_TICKS = int(os.getenv("WEATHER_REFRESH_TICKS", "60"))


def build_state(env_result: dict, weather: dict) -> dict:
    """Combine environment output + weather into the state vector."""
    return {
        "indoor_temp":   env_result["indoor_temp"],
        "outdoor_temp":  weather["outdoor_temp"],
        "humidity":      weather["humidity"],
        "wind_kmh":      weather["wind_kmh"],
        "wind_dir":      weather["wind_dir"],
        "aqi":           weather["aqi"],
        "rain_mm":       weather["rain_mm"],
        "hour":          datetime.now().hour,
        "traffic_load":  env_result["traffic_load"],
        "server_heat_w": env_result["server_heat_w"],
        "cooling_w":     env_result["cooling_w"],
    }


def run_agent():
    """Main synchronous agent loop."""
    logger.info("=== Intelligent Environment Controller starting ===")
    logger.info(f"Target temp: {TARGET_TEMP}°C  |  Tick: {TICK_INTERVAL}s  |  WS port: {WS_PORT}")

    mem     = get_memory()
    env     = Environment(initial_temp=26.0)
    weather = fetch_weather()
    logger.info(f"Initial weather ({weather['source']}): {weather['outdoor_temp']}°C  H={weather['humidity']}%")

    current_action = "ac_medium"   # seed action
    tick           = 0

    while True:
        tick += 1
        loop_start = time.time()

        # ── 1. Refresh outdoor weather every N ticks ──────────────────────────
        if tick % WEATHER_REFRESH_TICKS == 0:
            weather = fetch_weather()
            logger.info(f"Weather refreshed ({weather['source']}): {weather['outdoor_temp']}°C")

        # ── 2. Apply last action to environment → get new indoor_temp ─────────
        temp_before = env.get_temp()
        env_result  = env.step(current_action, outdoor_temp=weather["outdoor_temp"], dt=TICK_INTERVAL)

        # ── 3. Build state vector ─────────────────────────────────────────────
        state = build_state(env_result, weather)

        # ── 4. Get last 5 decisions from memory ───────────────────────────────
        history = mem.get_recent(5)

        # ── 5. Controller → next action + reason ──────────────────────────────
        decision   = decide(state, history, TARGET_TEMP)
        next_action = decision["action"]
        reason      = decision["reason"]

        # ── 6. Actuator → power numbers ───────────────────────────────────────
        hw = actuate(next_action)

        # ── 7. Evaluator → reward ─────────────────────────────────────────────
        reward = evaluate(
            action      = current_action,
            temp_before = temp_before,
            temp_after  = env_result["indoor_temp"],
            target_temp = TARGET_TEMP,
        )

        # ── 8. Save to memory ─────────────────────────────────────────────────
        mem.save(
            state             = state,
            action            = current_action,
            reason            = reason,
            reward            = reward,
            indoor_temp_after = env_result["indoor_temp"],
        )

        # ── 9. Build full payload for dashboard ───────────────────────────────
        payload = {
            "sensorId":        "ENV_M_04",
            "timestamp":       datetime.now(timezone.utc).isoformat(),
            # Temp section
            "indoor_temp_c":   env_result["indoor_temp"],
            "target_temp_c":   TARGET_TEMP,
            "gap_c":           round(env_result["indoor_temp"] - TARGET_TEMP, 2),
            "traffic_load":    env_result["traffic_load"],
            "server_heat_w":   env_result["server_heat_w"],
            # Outdoor section
            "outdoor_temp_c":  weather["outdoor_temp"],
            "humidity_pct":    weather["humidity"],
            "wind_kmh":        weather["wind_kmh"],
            "wind_dir":        weather["wind_dir"],
            "aqi":             weather["aqi"],
            "rain_mm":         weather["rain_mm"],
            "weather_source":  weather["source"],
            # AI decision
            "action":          next_action,
            "reason":          reason,
            "ac_power":        hw["ac_power"],
            "fan_power":       hw["fan_power"],
            "cooling_draw_w":  hw["total_w"],
            "label":           hw["label"],
            # Evaluation
            "reward":          reward,
            "avg_reward_10":   mem.average_reward(10),
            # Status
            "status": "WARN_THERMAL_RISK" if abs(env_result["indoor_temp"] - TARGET_TEMP) > 2 else "OK",
        }

        # ── 10. Push to WebSocket → React dashboard ───────────────────────────
        ws_server.broadcast(payload)
        logger.info(
            f"[tick {tick:04d}] T={env_result['indoor_temp']:.2f}°C  "
            f"gap={payload['gap_c']:+.2f}  action={next_action}  reward={reward:.3f}"
        )

        # Advance action for next tick
        current_action = next_action

        # ── Sleep precisely ───────────────────────────────────────────────────
        elapsed = time.time() - loop_start
        sleep_for = max(0.0, TICK_INTERVAL - elapsed)
        time.sleep(sleep_for)


if __name__ == "__main__":
    # Start WebSocket server in a background thread
    ws_thread = threading.Thread(
        target=ws_server.start_server,
        args=(WS_PORT,),
        daemon=True,
    )
    ws_thread.start()
    logger.info(f"WebSocket server started on ws://localhost:{WS_PORT}")

    # Small delay so WS server is ready before first tick
    time.sleep(1.0)

    run_agent()

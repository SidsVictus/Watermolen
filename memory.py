"""
memory.py
─────────
Persistent in-memory store for the agent's decision history.

Each record:
  {
    "timestamp":   ISO string,
    "state":       { indoor_temp, outdoor_temp, humidity, hour, traffic_load },
    "action":      "ac_high" | "ac_medium" | "ac_low" | "fan_only" | "off",
    "reason":      str  (LLM justification),
    "reward":      float (0.0 – 1.0, from evaluator),
    "indoor_temp_after": float  (result of the action)
  }

Also exposes:
  get_recent(n)  → last n records (used by controller for context)
  all_records()  → full history list (used by dashboard)
"""

import json
import logging
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# Optionally persist to disk so history survives a restart
HISTORY_FILE = Path(__file__).parent / "memory_store.json"
MAX_RECORDS  = 500          # keep last N records in RAM


class Memory:
    def __init__(self, persist: bool = True):
        self._store: deque = deque(maxlen=MAX_RECORDS)
        self._persist = persist

        if persist and HISTORY_FILE.exists():
            self._load()

    # ── Write ─────────────────────────────────────────────────────────────────

    def save(
        self,
        state:            dict,
        action:           str,
        reason:           str,
        reward:           float,
        indoor_temp_after: float | None = None,
    ) -> dict:
        record = {
            "timestamp":         datetime.now(timezone.utc).isoformat(),
            "state":             state,
            "action":            action,
            "reason":            reason,
            "reward":            round(reward, 4),
            "indoor_temp_after": indoor_temp_after,
        }
        self._store.append(record)
        logger.debug(f"memory.save: action={action} reward={reward:.3f}")

        if self._persist:
            self._flush()

        return record

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_recent(self, n: int = 5) -> list[dict]:
        """Return the last n records — passed to controller as context."""
        return list(self._store)[-n:]

    def all_records(self) -> list[dict]:
        return list(self._store)

    def last_action(self) -> str | None:
        if self._store:
            return self._store[-1]["action"]
        return None

    def average_reward(self, n: int = 10) -> float:
        recent = list(self._store)[-n:]
        if not recent:
            return 0.0
        return sum(r["reward"] for r in recent) / len(recent)

    # ── Persistence ───────────────────────────────────────────────────────────

    def _flush(self):
        try:
            HISTORY_FILE.write_text(json.dumps(list(self._store), indent=2))
        except Exception as e:
            logger.warning(f"memory flush failed: {e}")

    def _load(self):
        try:
            data = json.loads(HISTORY_FILE.read_text())
            self._store.extend(data[-MAX_RECORDS:])
            logger.info(f"memory loaded {len(self._store)} records from disk")
        except Exception as e:
            logger.warning(f"memory load failed: {e}")


# ── Module-level singleton ────────────────────────────────────────────────────
_instance: Memory | None = None

def get_memory(persist: bool = True) -> Memory:
    global _instance
    if _instance is None:
        _instance = Memory(persist=persist)
    return _instance


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    mem = get_memory(persist=False)

    mem.save(
        state={"indoor_temp": 28.5, "outdoor_temp": 32.5, "humidity": 52, "hour": 14, "traffic_load": 0.88},
        action="ac_medium",
        reason="Temperature climbing toward 29°C — medium AC should hold it.",
        reward=0.81,
        indoor_temp_after=27.9,
    )

    print(json.dumps(mem.get_recent(5), indent=2))

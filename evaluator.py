"""
evaluator.py
────────────
Scores the result of each action and produces a reward (0.0 – 1.0).

Reward function:
  1. Comfort score  (50 %)  — how close indoor_temp is to target
  2. Energy score   (30 %)  — penalise unnecessary energy use
  3. Stability score(20 %)  — penalise large swings in temperature

The reward is stored in memory so the controller can learn from it.
"""

import math
import logging

logger = logging.getLogger(__name__)

# ── Weights ───────────────────────────────────────────────────────────────────
W_COMFORT   = 0.50
W_ENERGY    = 0.30
W_STABILITY = 0.20

# ── Thresholds ────────────────────────────────────────────────────────────────
COMFORT_TOLERANCE  = 1.0    # °C — within this → perfect comfort score
ENERGY_MAX_W       = 1800.0 # W  — reference for normalising cooling draw

# Action cooling power (W) — mirrors actuator.py
ACTION_COOLING_W = {
    "ac_high":   1800.0,
    "ac_medium": 1100.0,
    "ac_low":     550.0,
    "fan_only":   120.0,
    "off":          0.0,
}


def _comfort_score(indoor_temp: float, target_temp: float) -> float:
    """Gaussian decay around target: 1.0 at perfect, ~0 at ±5°C."""
    gap = abs(indoor_temp - target_temp)
    return math.exp(-(gap ** 2) / (2 * COMFORT_TOLERANCE ** 2))


def _energy_score(action: str, gap: float) -> float:
    """
    Penalise over-cooling when gap is small, reward efficient choices.
    If gap > 3°C, high energy is fine. If gap < 1°C, high energy is wasteful.
    """
    cooling_w = ACTION_COOLING_W.get(action, 120.0)
    base = 1.0 - (cooling_w / ENERGY_MAX_W)          # 1 = low energy, 0 = max energy
    # Bonus: if we used high energy when the gap was large, don't penalise
    need = min(gap / 3.0, 1.0)                        # how much cooling was needed
    bonus = need * (cooling_w / ENERGY_MAX_W) * 0.5   # reward justified energy spend
    return min(1.0, base + bonus)


def _stability_score(temp_before: float, temp_after: float) -> float:
    """Reward small temperature changes (stable environment)."""
    delta = abs(temp_after - temp_before)
    return math.exp(-delta * 2)


def evaluate(
    action:        str,
    temp_before:   float,
    temp_after:    float,
    target_temp:   float,
) -> float:
    """
    Compute reward for a completed action.

    Args:
        action:       action that was taken
        temp_before:  indoor temp BEFORE the action
        temp_after:   indoor temp AFTER the action (next tick)
        target_temp:  operator target (°C)

    Returns:
        reward: float in [0.0, 1.0]
    """
    gap = abs(temp_after - target_temp)

    comfort   = _comfort_score(temp_after,  target_temp)
    energy    = _energy_score(action, gap)
    stability = _stability_score(temp_before, temp_after)

    reward = (
        W_COMFORT   * comfort   +
        W_ENERGY    * energy    +
        W_STABILITY * stability
    )
    reward = round(min(1.0, max(0.0, reward)), 4)

    logger.debug(
        f"evaluate: action={action} gap={gap:.2f}°C "
        f"comfort={comfort:.3f} energy={energy:.3f} stability={stability:.3f} "
        f"→ reward={reward:.4f}"
    )
    return reward


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.DEBUG)

    tests = [
        ("ac_medium", 28.5, 27.2, 22.0),
        ("fan_only",  22.3, 22.1, 22.0),
        ("ac_high",   35.0, 30.0, 22.0),
        ("off",       22.0, 24.5, 22.0),
    ]
    for t in tests:
        r = evaluate(*t)
        print(f"  action={t[0]:12s} before={t[1]} after={t[2]} target={t[3]} → reward={r}")

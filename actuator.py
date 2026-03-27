"""
actuator.py
───────────
Converts the controller's action string into concrete power
numbers that get sent back to the frontend and logged.

Output:
  {
    "action":     str,
    "ac_power":   float  (0.0 – 1.0 duty cycle)
    "fan_power":  float  (0.0 – 1.0 duty cycle)
    "total_w":    float  (estimated watts drawn by cooling system)
    "label":      str    (human-readable status label)
  }

These numbers are what the React dashboard displays in the
"Incoming AI Command" terminal panel.
"""

import logging

logger = logging.getLogger(__name__)

# ── Action → hardware mapping ─────────────────────────────────────────────────
#   ac_power   = compressor duty cycle (0 = off, 1 = full blast)
#   fan_power  = fan speed fraction
#   total_w    = estimated electrical draw of the cooling system itself
ACTION_TABLE = {
    "ac_high":   {"ac_power": 1.00, "fan_power": 1.00, "total_w": 1800.0, "label": "MAX COOLING"},
    "ac_medium": {"ac_power": 0.60, "fan_power": 0.70, "total_w": 1100.0, "label": "MEDIUM COOLING"},
    "ac_low":    {"ac_power": 0.30, "fan_power": 0.50, "total_w":  550.0, "label": "LOW COOLING"},
    "fan_only":  {"ac_power": 0.00, "fan_power": 0.40, "total_w":  120.0, "label": "FAN ONLY"},
    "off":       {"ac_power": 0.00, "fan_power": 0.00, "total_w":    0.0, "label": "ALL OFF"},
}


def actuate(action: str) -> dict:
    """
    Convert action string to hardware power settings.

    Args:
        action: one of "ac_high", "ac_medium", "ac_low", "fan_only", "off"

    Returns:
        dict with ac_power, fan_power, total_w, label
    """
    entry = ACTION_TABLE.get(action)
    if entry is None:
        logger.warning(f"Unknown action '{action}' — defaulting to fan_only")
        entry = ACTION_TABLE["fan_only"]
        action = "fan_only"

    result = {"action": action, **entry}
    logger.info(
        f"actuate: {action} → ac={result['ac_power']:.0%} "
        f"fan={result['fan_power']:.0%} draw={result['total_w']:.0f}W"
    )
    return result


if __name__ == "__main__":
    import json, logging
    logging.basicConfig(level=logging.INFO)
    for a in ACTION_TABLE:
        print(json.dumps(actuate(a)))

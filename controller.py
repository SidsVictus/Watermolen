import os
import json
import logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
#----------------- FEATHERLESS------------
FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY", "")
FEATHERLESS_MODEL   = os.getenv("FEATHERLESS_MODEL", "deepseek-ai/DeepSeek-V3-0324")


VALID_ACTIONS = {"ac_high", "ac_medium", "ac_low", "fan_only", "off"}


# ----------------AI PROMPT-----------------
SYSTEM_PROMPT = """You are an autonomous AI controller for a server room in Hyderabad, India.
Decide the best cooling action every 5 seconds to keep server rack temperature close to target while minimising energy use.

Available actions:
  ac_high   - max compressor (~3800W cooling, expensive)
  ac_medium - balanced cooling (~2200W, moderate energy)
  ac_low    - light cooling (~1000W, low energy)
  fan_only  - circulation only (~300W, minimal energy)
  off       - all cooling off (only when temp is well below target)

Rules:
  1. If indoor_temp > target + 4C -> ac_high
  2. If indoor_temp > target + 2C -> ac_medium
  3. If within 1C of target -> fan_only or ac_low
  4. High traffic hours (9-17 IST) require proactive cooling
  5. If last 3 decisions had reward <0.6, try a different action

Respond with ONLY valid JSON, no markdown, no extra text:
{"action": "<one of the 5 actions>", "reason": "<one sentence explanation>"}"""

#------------------------------------------------------------------------
def _rule_engine(state: dict, target_temp: float) -> dict:
    gap     = state["indoor_temp"] - target_temp
    hour    = state.get("hour", 12)
    traffic = state.get("traffic_load", 0.5)
    if gap > 4.0:
        return {"action": "ac_high",   "reason": f"Critical: {gap:.1f}C above target - max cooling engaged."}
    elif gap > 2.0:
        return {"action": "ac_medium", "reason": f"Moderate gap of {gap:.1f}C - medium AC balancing load."}
    elif gap > 0.5 or (traffic > 0.75 and hour in range(9, 18)):
        return {"action": "ac_low",    "reason": "Small gap or peak traffic - light cooling."}
    elif gap < -1.5:
        return {"action": "off",       "reason": f"Room is {abs(gap):.1f}C below target - cooling off."}
    else:
        return {"action": "fan_only",  "reason": "Within tolerance - fan circulation sufficient."}


def decide(state: dict, history: list, target_temp: float) -> dict:
    if not FEATHERLESS_API_KEY:
        logger.warning("FEATHERLESS_API_KEY not set - using rule engine fallback")
        return _rule_engine(state, target_temp)

    hist_lines = []
    for r in history[-5:]:
        hist_lines.append(f"  action={r['action']} reward={r['reward']:.2f} reason=\"{r.get('reason','')[:60]}\"")
    hist_text = "\n".join(hist_lines) if hist_lines else "  (no history yet)"

    user_msg = f"""Current state:
  indoor_temp:  {state['indoor_temp']:.2f} C
  target_temp:  {target_temp:.1f} C
  gap:          {state['indoor_temp'] - target_temp:+.2f} C
  outdoor_temp: {state['outdoor_temp']:.1f} C
  humidity:     {state['humidity']:.1f} %
  hour_IST:     {state['hour']}
  traffic_load: {state['traffic_load']:.2f}


Last 5 decisions:
{hist_text}

Decide the next cooling action."""

    try:
        client = OpenAI(
            api_key  = FEATHERLESS_API_KEY,
            base_url = "https://api.featherless.ai/v1",
        )
        response = client.chat.completions.create(
            model       = FEATHERLESS_MODEL,
            messages    = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            max_tokens  = 200,
            temperature = 0.3,
        )

        raw = (response.choices[0].message.content or "").strip()
        reasoning = getattr(response.choices[0].message, "reasoning_content", "") or ""
        if not raw and reasoning:
            raw = reasoning.strip()
        if not raw:
            logger.warning("Empty response from model - falling back")
            return _rule_engine(state, target_temp)

        if "<tool_call>" in raw:
            raw = raw.split("<tool_call>")[-1].strip()
        if raw.startswith("```"):
            raw = raw.strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()

        parsed = json.loads(raw)
        action = parsed.get("action", "").strip().lower()
        reason = parsed.get("reason", "").strip()

        if action not in VALID_ACTIONS:
            logger.warning(f"Model returned unknown action '{action}' - falling back")
            return _rule_engine(state, target_temp)

        logger.info(f"DeepSeek R1: action={action}  reason={reason[:80]}")
        return {"action": action, "reason": reason}

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e} | raw={raw!r}")
        return _rule_engine(state, target_temp)
    except Exception as e:
        logger.error(f"Featherless API error: {e}")
        return _rule_engine(state, target_temp)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    test_state = {
        "indoor_temp": 29.3, "outdoor_temp": 32.5,
        "humidity": 55.0, "hour": 14, "traffic_load": 0.88,
    }
    result = decide(test_state, [], target_temp=22.0)
    print(json.dumps(result, indent=2))
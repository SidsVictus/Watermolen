"""
scraper.py
──────────
Fetches real outdoor weather for Hyderabad from BrightData's
Web Scraper API (SERP dataset).  Falls back to OpenWeatherMap
if BrightData credentials are missing.

Returns a dict:
  {
    "outdoor_temp": float,   # °C
    "humidity":     float,   # %
    "wind_kmh":     float,
    "wind_dir":     str,
    "aqi":          float,
    "rain_mm":      float,
    "source":       str      # "brightdata" | "owm" | "fallback"
  }
"""

import os
import json
import logging
import requests

logger = logging.getLogger(__name__)

# ── BrightData credentials (set in .env or environment) ─────────────────────
BRIGHTDATA_API_KEY  = os.getenv("BRIGHTDATA_API_KEY", "")
BRIGHTDATA_DATASET  = os.getenv("BRIGHTDATA_DATASET_ID", "")   # e.g. "gd_l7q7dkf244hwjntr0"
BRIGHTDATA_SNAPSHOT = os.getenv("BRIGHTDATA_SNAPSHOT_ID", "")  # optional: use a snapshot

# ── OpenWeatherMap fallback ──────────────────────────────────────────────────
OWM_API_KEY = os.getenv("OWM_API_KEY", "")
OWM_URL     = "https://api.openweathermap.org/data/2.5/weather"
OWM_AQI_URL = "https://api.openweathermap.org/data/2.5/air_pollution"

# Hyderabad lat/lon
LAT, LON = 17.3850, 78.4867

WIND_DIRECTIONS = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW"
]

def _degrees_to_dir(deg: float) -> str:
    idx = round(deg / 22.5) % 16
    return WIND_DIRECTIONS[idx]


def fetch_from_brightdata() -> dict | None:
    """
    Uses BrightData's Web Unlocker / SERP API to scrape a
    weather page for Hyderabad.  We hit the Google Weather
    SERP which returns structured JSON via BrightData's
    dataset endpoint.
    """
    if not BRIGHTDATA_API_KEY or not BRIGHTDATA_DATASET:
        return None

    headers = {
        "Authorization": f"Bearer {BRIGHTDATA_API_KEY}",
        "Content-Type": "application/json",
    }

    # BrightData Web Scraper – trigger a fresh collect
    trigger_url = f"https://api.brightdata.com/datasets/v3/trigger?dataset_id={BRIGHTDATA_DATASET}&include_errors=true"
    payload = [{"url": f"https://www.google.com/search?q=weather+hyderabad&hl=en"}]

    try:
        resp = requests.post(trigger_url, headers=headers, json=payload, timeout=15)
        resp.raise_for_status()
        snapshot_id = resp.json().get("snapshot_id")

        if not snapshot_id:
            return None

        # Poll for result (up to 30 s)
        import time
        for _ in range(6):
            time.sleep(5)
            result_url = f"https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}?format=json"
            r = requests.get(result_url, headers=headers, timeout=15)
            if r.status_code == 200:
                rows = r.json()
                if rows:
                    row = rows[0]
                    return {
                        "outdoor_temp": float(row.get("temperature_celsius", 32)),
                        "humidity":     float(row.get("humidity", 50)),
                        "wind_kmh":     float(row.get("wind_speed_kmh", 12)),
                        "wind_dir":     row.get("wind_direction", "N"),
                        "aqi":          float(row.get("aqi", 60)),
                        "rain_mm":      float(row.get("precipitation_mm", 0)),
                        "source":       "brightdata",
                    }
    except Exception as e:
        logger.warning(f"BrightData fetch failed: {e}")

    return None


def fetch_from_owm() -> dict | None:
    """OpenWeatherMap free-tier fallback."""
    if not OWM_API_KEY:
        return None

    try:
        # Weather
        wr = requests.get(OWM_URL, params={
            "lat": LAT, "lon": LON,
            "appid": OWM_API_KEY, "units": "metric"
        }, timeout=10)
        wr.raise_for_status()
        w = wr.json()

        # AQI
        ar = requests.get(OWM_AQI_URL, params={
            "lat": LAT, "lon": LON, "appid": OWM_API_KEY
        }, timeout=10)
        ar.raise_for_status()
        aqi_raw = ar.json()["list"][0]["main"]["aqi"]   # 1-5 scale → map to 0-200
        aqi = (aqi_raw - 1) * 50.0

        wind_deg = w.get("wind", {}).get("deg", 0)
        rain_mm  = w.get("rain", {}).get("1h", 0.0)

        return {
            "outdoor_temp": float(w["main"]["temp"]),
            "humidity":     float(w["main"]["humidity"]),
            "wind_kmh":     float(w.get("wind", {}).get("speed", 0)) * 3.6,
            "wind_dir":     _degrees_to_dir(wind_deg),
            "aqi":          aqi,
            "rain_mm":      float(rain_mm),
            "source":       "owm",
        }
    except Exception as e:
        logger.warning(f"OWM fetch failed: {e}")
    return None


def fetch_weather() -> dict:
    """
    Public entry point.
    Priority: BrightData → OWM → hardcoded Hyderabad fallback.
    """
    result = fetch_from_brightdata()
    if result:
        return result

    result = fetch_from_owm()
    if result:
        return result

    # Static fallback so the rest of the pipeline never crashes
    logger.warning("All weather sources failed — using static fallback for Hyderabad")
    return {
        "outdoor_temp": 32.5,
        "humidity":     52.0,
        "wind_kmh":     12.0,
        "wind_dir":     "NW",
        "aqi":          58.0,
        "rain_mm":      0.0,
        "source":       "fallback",
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    data = fetch_weather()
    print(json.dumps(data, indent=2))

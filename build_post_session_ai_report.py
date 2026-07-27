import argparse
import csv
import json
import math
import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import requests
except ImportError:
    requests = None


DEFAULT_INPUT = "telemetry_live.csv"
DEFAULT_MARKDOWN_OUTPUT = "post_session_ai_report.md"
DEFAULT_JSON_OUTPUT = "post_session_ai_report.json"
DEFAULT_AI_OUTPUT = "ai_coach_response.md"

API_BASE = os.getenv("F1_API_BASE", "https://f1-telementry-1.onrender.com")
F1_AUTH_TOKEN = os.getenv("F1_AUTH_TOKEN")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")

AI_COACH_SYSTEM_PROMPT = (
    "You are an expert F1 driving coach analyzing post-session telemetry data. "
    "The driver is playing F1 25 (the video game) and wants to improve their lap times.\n\n"
    "Respond with:\n"
    "1. Session overview in 3 short bullets.\n"
    "2. Top 3 improvements, each backed by specific telemetry evidence from the report "
    "(reference lap numbers, distances, speeds, and percentages).\n"
    "3. One lap-specific coaching note.\n"
    "4. One drill or focus area for the next session.\n"
    "5. If driving assists are active, include a specific recommendation on which assist to "
    "disable next and why it will help the driver improve.\n"
    "6. A short confidence score (low/medium/high) explaining how complete the telemetry data was "
    "and whether you had enough information to give reliable advice."
)

# Track corner/zone names mapped by approximate lap distance ranges (metres).
# Each entry: (start_m, end_m, name)
TRACK_CORNERS = {
    "Melbourne": [
        (0, 150, "Turn 1"),
        (150, 350, "Turn 2"),
        (350, 550, "Turn 3"),
        (700, 900, "Turn 4"),
        (900, 1050, "Turn 5"),
        (1050, 1250, "Turn 6"),
        (1250, 1450, "Turn 7-8"),
        (1450, 1700, "Turn 9"),
        (1700, 1900, "Turn 10"),
        (1900, 2200, "Turn 11"),
        (2200, 2500, "Turn 12"),
        (2500, 2800, "Turn 13"),
        (3200, 3500, "Turn 14"),
    ],
    "Suzuka": [
        (0, 250, "Turn 1 (First Curve)"),
        (250, 550, "Turn 2"),
        (550, 800, "Turns 3-4 (S Curves)"),
        (800, 1100, "Turns 5-6 (S Curves)"),
        (1100, 1350, "Turn 7 (Dunlop)"),
        (1350, 1700, "Turns 8-9 (Degner 1-2)"),
        (1700, 2200, "Turn 10 (Hairpin)"),
        (2200, 2700, "Turn 11 (200R)"),
        (2700, 3200, "Turns 12-13 (Spoon)"),
        (3200, 3800, "Turn 14 (Back straight)"),
        (3800, 4200, "Turn 15 (130R)"),
        (4200, 4700, "Turn 16-17 (Chicane)"),
        (4700, 5100, "Turn 18 (Final)"),
    ],
    "Monza": [
        (0, 350, "Turn 1-2 (Variante del Rettifilo)"),
        (350, 850, "Curva Grande"),
        (850, 1200, "Turn 4-5 (Variante della Roggia)"),
        (1200, 2100, "Curve di Lesmo 1-2"),
        (2100, 2800, "Turn 8 (Serraglio)"),
        (2800, 3400, "Curva del Vialone"),
        (3400, 4000, "Turn 11 (Variante Ascari)"),
        (4000, 4700, "Curva Parabolica"),
        (4700, 5200, "Turn 14 (Alboreto)"),
    ],
    "Silverstone": [
        (0, 300, "Turn 1 (Abbey)"),
        (300, 600, "Turn 2 (Farm)"),
        (600, 900, "Turn 3 (Village)"),
        (900, 1200, "Turn 4-5 (The Loop)"),
        (1200, 1600, "Turn 6 (Brooklands)"),
        (1600, 2000, "Turn 7-8 (Luffield)"),
        (2000, 2500, "Turn 9 (Copse)"),
        (2500, 3200, "Turns 10-11 (Maggots-Becketts)"),
        (3200, 3600, "Turn 12 (Chapel)"),
        (3600, 4100, "Hangar Straight"),
        (4100, 4500, "Turn 13-14 (Stowe-Vale)"),
        (4500, 5100, "Turn 15-16 (Club)"),
    ],
    "Spa": [
        (0, 350, "Turn 1 (La Source)"),
        (350, 1000, "Eau Rouge / Raidillon"),
        (1000, 1800, "Kemmel Straight"),
        (1800, 2200, "Turn 5 (Les Combes)"),
        (2200, 2600, "Turn 6-7 (Malmedy)"),
        (2600, 3100, "Turn 8 (Rivage)"),
        (3100, 3700, "Turns 9-10 (Fagnes)"),
        (3700, 4300, "Turn 11 (Pouhon)"),
        (4300, 4800, "Turns 12-13 (Les Fagnes)"),
        (4800, 5400, "Turn 14 (Stavelot)"),
        (5400, 6000, "Turn 15-16 (Paul Frère)"),
        (6000, 6500, "Turn 17-18 (Blanchimont)"),
        (6500, 7000, "Turn 19 (Bus Stop)"),
    ],
    "Sakhir (Bahrain)": [
        (0, 300, "Turn 1"),
        (300, 550, "Turn 2-3"),
        (550, 800, "Turn 4"),
        (800, 1100, "Turn 5-6-7"),
        (1100, 1500, "Turn 8"),
        (1500, 1800, "Turn 9"),
        (1800, 2200, "Turn 10"),
        (2200, 2600, "Turn 11-12"),
        (2600, 3100, "Turn 13"),
        (3100, 3500, "Turn 14"),
        (3500, 4000, "Turn 15"),
    ],
    "Jeddah": [
        (0, 300, "Turn 1"),
        (300, 700, "Turn 2-3"),
        (700, 1200, "Turns 4-5-6-7"),
        (1200, 1700, "Turns 8-9-10"),
        (1700, 2200, "Turns 11-12"),
        (2200, 2800, "Turn 13 (Hairpin)"),
        (2800, 3400, "Turns 14-15-16"),
        (3400, 4000, "Turns 17-18-19"),
        (4000, 4600, "Turns 20-21"),
        (4600, 5200, "Turn 22-23"),
        (5200, 5800, "Turns 24-25-26-27"),
    ],
    "Monaco": [
        (0, 200, "Sainte Dévote"),
        (200, 600, "Beau Rivage"),
        (600, 900, "Massenet / Casino"),
        (900, 1200, "Mirabeau"),
        (1200, 1500, "Hairpin (Loews)"),
        (1500, 1800, "Portier"),
        (1800, 2300, "Tunnel"),
        (2300, 2600, "Chicane (Nouvelle)"),
        (2600, 2900, "Tabac"),
        (2900, 3200, "Swimming Pool"),
        (3200, 3500, "La Rascasse / Anthony Noghès"),
    ],
}


def lookup_corner_name(track_name, start_distance_m, end_distance_m):
    """Look up the corner name for a given track and distance range."""
    if not track_name:
        return None
    corners = TRACK_CORNERS.get(track_name)
    if not corners:
        return None
    if start_distance_m is None:
        return None

    mid_point = (start_distance_m + (end_distance_m or start_distance_m)) / 2.0

    for corner_start, corner_end, name in corners:
        if corner_start <= mid_point <= corner_end:
            return name

    # Fallback: find closest corner
    best = None
    best_dist = float("inf")
    for corner_start, corner_end, name in corners:
        corner_mid = (corner_start + corner_end) / 2.0
        dist = abs(mid_point - corner_mid)
        if dist < best_dist and dist < 200:  # within 200m tolerance
            best_dist = dist
            best = name

    return best


def parse_float(value, default=None):
    if value is None:
        return default
    text = str(value).strip()
    if text == "" or text.lower() in {"none", "null", "nan"}:
        return default
    try:
        number = float(text)
    except ValueError:
        return default
    return number if math.isfinite(number) else default


def parse_int(value, default=None):
    number = parse_float(value, None)
    if number is None:
        return default
    return int(number)


def parse_bool(value):
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    return text in {"1", "true", "yes", "on"}


def parse_timestamp(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def format_time(seconds):
    if seconds is None:
        return "-"
    minutes = int(seconds // 60)
    secs = seconds - minutes * 60
    return f"{minutes}:{secs:05.2f}"


def pct(value):
    if value is None:
        return "-"
    return f"{value:.1f}%"


def avg(values):
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else None


def median(values):
    clean = sorted(v for v in values if v is not None)
    if not clean:
        return None
    mid = len(clean) // 2
    if len(clean) % 2:
        return clean[mid]
    return (clean[mid - 1] + clean[mid]) / 2


def percentile(values, p):
    clean = sorted(v for v in values if v is not None)
    if not clean:
        return None
    idx = min(len(clean) - 1, max(0, round((p / 100) * (len(clean) - 1))))
    return clean[idx]


def field(row, *names):
    for name in names:
        if name in row:
            return row.get(name)
    return None


def normalize_row(row, index):
    timestamp = parse_timestamp(field(row, "timestamp", "time"))
    lap_number = parse_int(field(row, "lap_number", "lapNumber", "lap"))

    return {
        "index": index,
        "timestamp": timestamp,
        "timestampRaw": field(row, "timestamp", "time"),
        "lapNumber": lap_number,
        "sector": parse_int(field(row, "sector", "currentSector", "current_sector")),
        "lapDistanceM": parse_float(field(row, "lap_distance", "lapDistance")),
        "totalDistanceM": parse_float(field(row, "total_distance", "totalDistance")),
        "speedKph": parse_float(field(row, "speed_kph", "speedKph", "speed")),
        "throttle": parse_float(field(row, "throttle")),
        "brake": parse_float(field(row, "brake")),
        "steering": parse_float(field(row, "steering", "steer")),
        "rpm": parse_int(field(row, "rpm")),
        "gear": parse_int(field(row, "gear")),
        "deltaToPbMs": parse_float(field(row, "delta_to_pb", "deltaToPB")),
        "corneringSpeedKph": parse_float(field(row, "cornering_speed", "corneringSpeed")),
        "brakingDistanceM": parse_float(field(row, "braking_distance", "brakingDistance")),
        "drs": parse_bool(field(row, "drs")),
        "drsActivationDistance": parse_float(field(row, "drs_activation_distance", "drsActivationDistance")),
    }


def load_samples(csv_path):
    with open(csv_path, newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        samples = [normalize_row(row, index) for index, row in enumerate(reader, start=1)]

    return [
        sample
        for sample in samples
        if sample["lapNumber"] is not None and sample["speedKph"] is not None
    ]


def load_samples_from_api(session_id, max_samples=2000, auth_token=None):
    """Fetch telemetry samples from the backend API using a session ID."""
    if requests is None:
        raise SystemExit("Cannot fetch from API: 'requests' library not installed. Run: pip install requests")

    token = auth_token or F1_AUTH_TOKEN
    if not token:
        raise SystemExit(
            "API requires authentication. Set F1_AUTH_TOKEN environment variable or pass --token.\n"
            "To get your token: open the web app, open browser DevTools → Console, run:\n"
            "  localStorage.getItem('f1AuthToken')"
        )

    url = f"{API_BASE}/sessions/{session_id}/performance?maxSamples={max_samples}"
    print(f"Fetching session {session_id} from {API_BASE}...")

    headers = {"Authorization": f"Bearer {token}"}

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        raise SystemExit(f"API error: {e} — {e.response.text[:300] if e.response else ''}")
    except requests.exceptions.RequestException as e:
        raise SystemExit(f"Failed to reach API: {e}")

    data = response.json()
    traces = data.get("traces") or []
    api_laps = data.get("laps") or []
    api_session = data.get("session") or {}

    if not traces:
        raise SystemExit(f"No telemetry traces found for session {session_id}.")

    print(f"  Got {len(traces)} samples from API.")

    # Extract session metadata
    track_name = api_session.get("trackName")
    track_id = api_session.get("trackId")
    if track_name:
        print(f"  Track: {track_name}")

    # Extract assist profile from laps (most reliable source)
    session_assists = None
    lap_times = {}
    for lap in api_laps:
        lap_assists = lap.get("assists")
        if lap_assists and isinstance(lap_assists, dict) and session_assists is None:
            session_assists = lap_assists
        lap_num = parse_int(lap.get("lapNumber"))
        lap_time_ms = parse_int(lap.get("lapTimeMs"))
        if lap_num is not None and lap_time_ms is not None and lap_time_ms > 0:
            lap_times[lap_num] = lap_time_ms

    session_meta = {
        "trackName": track_name,
        "trackId": track_id,
    }

    samples = []
    for index, row in enumerate(traces, start=1):
        # API returns throttlePct/brakePct (0-100), convert to 0-1 fractions
        throttle_pct = parse_float(row.get("throttlePct"))
        brake_pct = parse_float(row.get("brakePct"))
        throttle = throttle_pct / 100.0 if throttle_pct is not None else parse_float(row.get("throttle"))
        brake = brake_pct / 100.0 if brake_pct is not None else parse_float(row.get("brake"))

        sample = {
            "index": index,
            "timestamp": parse_timestamp(row.get("timestamp")),
            "timestampRaw": row.get("timestamp"),
            "lapNumber": parse_int(row.get("lapNumber")),
            "sector": parse_int(row.get("sector") or row.get("currentSector")),
            "lapDistanceM": parse_float(row.get("lapDistance") or row.get("distanceM")),
            "totalDistanceM": parse_float(row.get("totalDistance") or row.get("distanceM")),
            "speedKph": parse_float(row.get("speedKph") or row.get("speed")),
            "throttle": throttle,
            "brake": brake,
            "steering": parse_float(row.get("steering") or row.get("steer")),
            "rpm": parse_int(row.get("rpm")),
            "gear": parse_int(row.get("gear")),
            "deltaToPbMs": parse_float(row.get("deltaToPB") or row.get("deltaToPb")),
            "corneringSpeedKph": parse_float(row.get("corneringSpeedKph") or row.get("corneringSpeed")),
            "brakingDistanceM": parse_float(row.get("brakingDistance")),
            "drs": bool(row.get("drs")),
            "drsActivationDistance": parse_float(row.get("drsActivationDistance")),
        }
        if sample["lapNumber"] is not None and sample["speedKph"] is not None:
            samples.append(sample)

    if not samples:
        raise SystemExit("No usable telemetry samples in API response.")

    print(f"  {len(samples)} usable samples after filtering.")
    return samples, session_assists, lap_times, session_meta


def duration_seconds(samples):
    times = [sample["timestamp"] for sample in samples if sample["timestamp"]]
    if len(times) < 2:
        return None
    return max(0.0, (max(times) - min(times)).total_seconds())


def distance_span(samples, key="lapDistanceM"):
    distances = [sample[key] for sample in samples if sample[key] is not None]
    if not distances:
        return None
    return max(distances) - min(distances)


def ratio(samples, predicate):
    if not samples:
        return None
    return 100 * sum(1 for sample in samples if predicate(sample)) / len(samples)


def longest_run(samples, predicate):
    best = []
    current = []
    for sample in samples:
        if predicate(sample):
            current.append(sample)
            if len(current) > len(best):
                best = list(current)
        else:
            current = []
    return best


def segment_runs(samples, predicate, min_points=3):
    runs = []
    current = []

    for sample in samples:
        if predicate(sample):
            current.append(sample)
        else:
            if len(current) >= min_points:
                runs.append(current)
            current = []

    if len(current) >= min_points:
        runs.append(current)

    return runs


def summarize_segment(run):
    speeds = [sample["speedKph"] for sample in run if sample["speedKph"] is not None]
    brakes = [sample["brake"] for sample in run if sample["brake"] is not None]
    throttles = [sample["throttle"] for sample in run if sample["throttle"] is not None]
    steerings = [abs(sample["steering"] or 0) for sample in run]

    return {
        "startLapDistanceM": run[0]["lapDistanceM"],
        "endLapDistanceM": run[-1]["lapDistanceM"],
        "durationSec": duration_seconds(run),
        "distanceM": distance_span(run),
        "entrySpeedKph": speeds[0] if speeds else None,
        "minSpeedKph": min(speeds) if speeds else None,
        "exitSpeedKph": speeds[-1] if speeds else None,
        "avgSpeedKph": avg(speeds),
        "peakBrake": max(brakes) if brakes else None,
        "avgBrake": avg(brakes),
        "avgThrottle": avg(throttles),
        "peakAbsSteering": max(steerings) if steerings else None,
    }


def compute_drs_reaction_times(samples):
    """
    Calculate the time from when drsActivationDistance reaches 0
    (driver crosses the DRS activation point) to when DRS actually opens.

    Returns a list of reaction time dicts, one per DRS activation event.
    """
    reactions = []
    i = 0
    n = len(samples)

    while i < n:
        # Look for a sample where drsActivationDistance == 0 and DRS is not yet open.
        # drsActivationDistance == 0 means the car is at/past the activation line.
        sample = samples[i]
        dist = sample.get("drsActivationDistance")
        drs_active = sample.get("drs")

        if dist is not None and dist == 0.0 and not drs_active:
            activation_point_sample = sample
            activation_time = sample["timestamp"]

            if activation_time is None:
                i += 1
                continue

            # Scan forward to find when DRS flips to True
            j = i + 1
            while j < n:
                future = samples[j]
                future_dist = future.get("drsActivationDistance")

                # If activation distance goes back above 0 before DRS opened,
                # the driver missed/chose not to use DRS this time.
                if future_dist is not None and future_dist > 0:
                    break

                if future.get("drs"):
                    open_time = future["timestamp"]
                    if open_time is not None:
                        delta_sec = (open_time - activation_time).total_seconds()
                        if 0 < delta_sec < 5.0:  # sanity: ignore >5s gaps
                            reactions.append({
                                "lapNumber": sample.get("lapNumber"),
                                "lapDistanceM": sample.get("lapDistanceM"),
                                "reactionTimeSec": round(delta_sec, 4),
                            })
                    # Skip past this DRS zone
                    i = j
                    break
                j += 1
            else:
                i = j
                continue

        i += 1

    return reactions


def summarize_lap(lap_number, samples):
    speeds = [sample["speedKph"] for sample in samples if sample["speedKph"] is not None]
    throttles = [sample["throttle"] for sample in samples if sample["throttle"] is not None]
    brakes = [sample["brake"] for sample in samples if sample["brake"] is not None]
    steerings = [sample["steering"] for sample in samples if sample["steering"] is not None]
    deltas = [sample["deltaToPbMs"] for sample in samples if sample["deltaToPbMs"] is not None]

    braking_runs = segment_runs(samples, lambda s: (s["brake"] or 0) >= 0.08)
    corner_runs = segment_runs(samples, lambda s: abs(s["steering"] or 0) >= 0.25)
    overlap_run = longest_run(
        samples,
        lambda s: (s["throttle"] or 0) >= 0.1 and (s["brake"] or 0) >= 0.1,
    )
    coast_run = longest_run(
        samples,
        lambda s: (s["throttle"] or 0) < 0.05 and (s["brake"] or 0) < 0.05,
    )

    drs_reactions = compute_drs_reaction_times(samples)
    drs_reaction_times_sec = [r["reactionTimeSec"] for r in drs_reactions]

    return {
        "lapNumber": lap_number,
        "sampleCount": len(samples),
        "approxDurationSec": duration_seconds(samples),
        "distanceCoveredM": distance_span(samples),
        "avgSpeedKph": avg(speeds),
        "maxSpeedKph": max(speeds) if speeds else None,
        "p95SpeedKph": percentile(speeds, 95),
        "avgThrottlePct": (avg(throttles) or 0) * 100,
        "fullThrottlePct": ratio(samples, lambda s: (s["throttle"] or 0) >= 0.95),
        "avgBrakePct": (avg(brakes) or 0) * 100,
        "heavyBrakePct": ratio(samples, lambda s: (s["brake"] or 0) >= 0.5),
        "coastingPct": ratio(samples, lambda s: (s["throttle"] or 0) < 0.05 and (s["brake"] or 0) < 0.05),
        "throttleBrakeOverlapPct": ratio(samples, lambda s: (s["throttle"] or 0) >= 0.1 and (s["brake"] or 0) >= 0.1),
        "longestThrottleBrakeOverlapSec": duration_seconds(overlap_run),
        "longestCoastSec": duration_seconds(coast_run),
        "avgAbsSteering": avg([abs(value or 0) for value in steerings]),
        "maxAbsSteering": max([abs(value or 0) for value in steerings]) if steerings else None,
        "drsPct": ratio(samples, lambda s: s["drs"]),
        "drsReactionCount": len(drs_reactions),
        "drsAvgReactionTimeSec": avg(drs_reaction_times_sec),
        "drsFastestReactionTimeSec": min(drs_reaction_times_sec) if drs_reaction_times_sec else None,
        "drsSlowestReactionTimeSec": max(drs_reaction_times_sec) if drs_reaction_times_sec else None,
        "drsReactions": drs_reactions,
        "bestDeltaToPbMs": min(deltas) if deltas else None,
        "finalDeltaToPbMs": deltas[-1] if deltas else None,
        "brakingZoneCount": len(braking_runs),
        "corneringZoneCount": len(corner_runs),
        "brakingZones": [summarize_segment(run) for run in braking_runs[:12]],
        "corneringZones": [summarize_segment(run) for run in corner_runs[:12]],
    }


def summarize_session(samples, assists=None, lap_times=None, track_name=None):
    by_lap = defaultdict(list)
    for sample in samples:
        by_lap[sample["lapNumber"]].append(sample)

    lap_summaries = [
        summarize_lap(lap_number, by_lap[lap_number])
        for lap_number in sorted(by_lap)
    ]

    # Attach real lap times from API if available
    if lap_times:
        for lap in lap_summaries:
            real_time_ms = lap_times.get(lap["lapNumber"])
            if real_time_ms:
                lap["lapTimeMs"] = real_time_ms
                lap["lapTimeSec"] = round(real_time_ms / 1000.0, 3)

    # Attach corner names to braking/cornering zones
    if track_name:
        for lap in lap_summaries:
            for zone in lap.get("brakingZones", []):
                zone["cornerName"] = lookup_corner_name(
                    track_name, zone.get("startLapDistanceM"), zone.get("endLapDistanceM")
                )
            for zone in lap.get("corneringZones", []):
                zone["cornerName"] = lookup_corner_name(
                    track_name, zone.get("startLapDistanceM"), zone.get("endLapDistanceM")
                )

    speeds = [sample["speedKph"] for sample in samples]
    lap_durations = [lap.get("lapTimeSec") or lap["approxDurationSec"] for lap in lap_summaries if lap.get("lapTimeSec") or lap.get("approxDurationSec")]

    # Determine fastest lap
    timed_laps = [(lap["lapNumber"], lap["lapTimeMs"]) for lap in lap_summaries if lap.get("lapTimeMs")]
    fastest_lap = min(timed_laps, key=lambda x: x[1])[0] if timed_laps else None

    session = {
        "sampleCount": len(samples),
        "lapCount": len(lap_summaries),
        "trackName": track_name,
        "firstTimestamp": samples[0]["timestampRaw"] if samples else None,
        "lastTimestamp": samples[-1]["timestampRaw"] if samples else None,
        "approxDurationSec": duration_seconds(samples),
        "avgSpeedKph": avg(speeds),
        "maxSpeedKph": max(speeds) if speeds else None,
        "lapDurationMedianSec": median(lap_durations),
        "lapDurationSpreadSec": (max(lap_durations) - min(lap_durations)) if len(lap_durations) >= 2 else None,
        "fastestLap": fastest_lap,
    }

    return {
        "schema": "f1-post-session-ai-report-v1",
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "session": session,
        "assists": assists,
        "laps": lap_summaries,
        "coachSignals": build_coach_signals(lap_summaries, assists),
    }


def build_coach_signals(laps, assists=None):
    signals = []

    # Assist-related signals (session-level, not per-lap)
    if assists and isinstance(assists, dict):
        active_assists = []

        if assists.get("tractionControlActive"):
            label = assists.get("tractionControlLabel", "On")
            active_assists.append(f"Traction Control ({label})")

        if assists.get("antiLockBrakesActive"):
            active_assists.append("ABS (Anti-Lock Brakes)")

        if assists.get("automaticGearbox"):
            active_assists.append("Automatic Gearbox")
        elif assists.get("suggestedGear"):
            active_assists.append("Suggested Gear")

        if assists.get("brakingAssistActive"):
            active_assists.append("Braking Assist")

        if assists.get("steeringAssistActive"):
            active_assists.append("Steering Assist")

        if assists.get("drsAssistActive"):
            active_assists.append("DRS Assist")

        if assists.get("ersAssistActive"):
            active_assists.append("ERS Assist")

        if assists.get("dynamicRacingLineActive"):
            active_assists.append("Dynamic Racing Line")

        if active_assists:
            signals.append({
                "severity": "info",
                "area": "driving assists",
                "lap": "all",
                "evidence": f"Active assists: {', '.join(active_assists)}.",
                "coachingAngle": (
                    "The driver is using driving assists. To improve long-term pace and car control, "
                    "consider gradually reducing assists. Start by disabling one at a time: "
                    "racing line first, then ABS, then traction control. "
                    "Manual inputs give finer control over braking points, throttle application, and corner entry."
                ),
            })

    for lap in laps:
        lap_label = f"Lap {lap['lapNumber']}"

        if (lap.get("throttleBrakeOverlapPct") or 0) >= 3:
            signals.append({
                "severity": "high",
                "area": "pedal overlap",
                "lap": lap["lapNumber"],
                "evidence": f"{lap_label}: throttle and brake overlap for {lap['throttleBrakeOverlapPct']:.1f}% of samples.",
                "coachingAngle": "Check if the driver is dragging brake while already applying throttle. This can hurt exits and tyre temperature.",
            })

        if (lap.get("coastingPct") or 0) >= 18:
            signals.append({
                "severity": "medium",
                "area": "coasting",
                "lap": lap["lapNumber"],
                "evidence": f"{lap_label}: coasting for {lap['coastingPct']:.1f}% of samples.",
                "coachingAngle": "Look for corners where the driver is neither braking nor accelerating. They may be giving up time before turn-in or before exit.",
            })

        if (lap.get("fullThrottlePct") or 0) < 35:
            signals.append({
                "severity": "medium",
                "area": "throttle confidence",
                "lap": lap["lapNumber"],
                "evidence": f"{lap_label}: full throttle only {lap['fullThrottlePct']:.1f}% of samples.",
                "coachingAngle": "Compare exits and straights. The driver may be waiting too long before committing to power.",
            })

        if (lap.get("heavyBrakePct") or 0) >= 16:
            signals.append({
                "severity": "medium",
                "area": "braking load",
                "lap": lap["lapNumber"],
                "evidence": f"{lap_label}: heavy braking for {lap['heavyBrakePct']:.1f}% of samples.",
                "coachingAngle": "Review braking zones for over-slowing, braking too long, or missing trail-brake release.",
            })

        drs_avg_reaction = lap.get("drsAvgReactionTimeSec")
        if drs_avg_reaction is not None and drs_avg_reaction > 0.3:
            signals.append({
                "severity": "medium" if drs_avg_reaction < 0.6 else "high",
                "area": "DRS reaction time",
                "lap": lap["lapNumber"],
                "evidence": f"{lap_label}: average DRS reaction time {drs_avg_reaction:.3f}s across {lap.get('drsReactionCount', 0)} activation(s).",
                "coachingAngle": "The driver is slow to open DRS after crossing the activation line. Every tenth lost here is free time on a straight. Anticipate the line and press DRS immediately.",
            })

    return signals[:18]


def round_value(value, digits=2):
    if value is None:
        return None
    if isinstance(value, float):
        return round(value, digits)
    return value


def format_number(value, digits=1, suffix=""):
    if value is None:
        return "-"
    return f"{value:.{digits}f}{suffix}"


def markdown_table(headers, rows):
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(item) for item in row) + " |")
    return "\n".join(lines)


def render_markdown(report):
    session = report["session"]
    laps = report["laps"]
    signals = report["coachSignals"]

    lap_rows = [
        [
            lap["lapNumber"],
            format_time(lap.get("lapTimeSec") or lap["approxDurationSec"]),
            format_number(lap["avgSpeedKph"], 1, " kph"),
            format_number(lap["maxSpeedKph"], 0, " kph"),
            pct(lap["fullThrottlePct"]),
            pct(lap["heavyBrakePct"]),
            pct(lap["coastingPct"]),
            pct(lap["throttleBrakeOverlapPct"]),
            lap["brakingZoneCount"],
            lap["corneringZoneCount"],
        ]
        for lap in laps
    ]

    lines = [
        "# F1 25 Post-Session AI Telemetry Report",
        "",
        "This file is designed for an AI coach to read. It summarizes the session instead of dumping every raw telemetry row.",
        "",
        "## Session Snapshot",
        "",
        f"- Report schema: `{report['schema']}`",
        f"- Generated at: {report['generatedAt']}",
        f"- Samples analysed: {session['sampleCount']}",
        f"- Track: {session['trackName'] or 'Unknown'}",
        f"- Laps detected: {session['lapCount']}",
        f"- Approx session duration: {format_time(session['approxDurationSec'])}",
        f"- Average speed: {format_number(session['avgSpeedKph'], 1, ' kph')}",
        f"- Top speed: {format_number(session['maxSpeedKph'], 0, ' kph')}",
        f"- Lap duration spread: {format_number(session['lapDurationSpreadSec'], 2, ' sec')}",
        f"- Fastest lap: Lap {session['fastestLap']}" if session.get('fastestLap') else "- Fastest lap: -",
        "",
    ]

    # Assists section
    assists = report.get("assists")
    if assists and isinstance(assists, dict):
        active_list = []
        inactive_list = []

        assist_checks = [
            ("Traction Control", assists.get("tractionControlActive"), assists.get("tractionControlLabel")),
            ("ABS", assists.get("antiLockBrakesActive"), None),
            ("Gearbox", assists.get("automaticGearbox") or assists.get("suggestedGear"), assists.get("gearboxAssistLabel")),
            ("Braking Assist", assists.get("brakingAssistActive"), None),
            ("Steering Assist", assists.get("steeringAssistActive"), None),
            ("DRS Assist", assists.get("drsAssistActive"), None),
            ("ERS Assist", assists.get("ersAssistActive"), None),
            ("Dynamic Racing Line", assists.get("dynamicRacingLineActive"), None),
        ]

        for name, is_active, label in assist_checks:
            display = f"{name} ({label})" if label and label != "Unknown" else name
            if is_active:
                active_list.append(display)
            else:
                inactive_list.append(name)

        lines.extend([
            "## Driving Assists",
            "",
        ])
        if active_list:
            lines.append(f"- **Active:** {', '.join(active_list)}")
        else:
            lines.append("- **Active:** None (fully manual)")
        if inactive_list:
            lines.append(f"- **Disabled:** {', '.join(inactive_list)}")
        lines.append("")
    else:
        lines.extend([
            "## Driving Assists",
            "",
            "- Assist data not available for this session.",
            "",
        ])

    lines.extend([
        "## How To Coach From This File",
        "",
        "- Prioritize high severity coach signals first.",
        "- Compare laps against each other, not against a generic ideal lap.",
        "- Look for patterns: long coasting, throttle/brake overlap, low full-throttle percentage, and heavy braking time.",
        "- Give specific, actionable tips: where to brake, where to release brake, when to commit to throttle, and how to smooth steering.",
        "- If driving assists are active, suggest a path to gradually reducing them.",
        "",
        "## Lap Summary",
        "",
        markdown_table(
            [
                "Lap",
                "Approx time",
                "Avg speed",
                "Top speed",
                "Full throttle",
                "Heavy brake",
                "Coasting",
                "Pedal overlap",
                "Brake zones",
                "Corner zones",
            ],
            lap_rows,
        ),
        "",
        "## Coach Signals",
        "",
    ])

    if signals:
        for index, signal in enumerate(signals, start=1):
            lines.extend([
                f"### Signal {index}: {signal['area'].title()}",
                "",
                f"- Severity: {signal['severity']}",
                f"- Lap: {signal['lap']}",
                f"- Evidence: {signal['evidence']}",
                f"- Coaching angle: {signal['coachingAngle']}",
                "",
            ])
    else:
        lines.extend([
            "No major automatic warning signals were detected. Focus on consistency, racing line, and lap-to-lap comparison.",
            "",
        ])

    lines.extend([
        "## Lap Details",
        "",
    ])

    for lap in laps:
        lines.extend([
            f"### Lap {lap['lapNumber']}",
            "",
            f"- Lap time: {format_time(lap.get('lapTimeSec'))}" if lap.get("lapTimeSec") else f"- Approx duration: {format_time(lap['approxDurationSec'])}",
            f"- Distance covered: {format_number(lap['distanceCoveredM'], 1, ' m')}",
            f"- Average speed: {format_number(lap['avgSpeedKph'], 1, ' kph')}",
            f"- 95th percentile speed: {format_number(lap['p95SpeedKph'], 1, ' kph')}",
            f"- Max speed: {format_number(lap['maxSpeedKph'], 0, ' kph')}",
            f"- Average throttle: {pct(lap['avgThrottlePct'])}",
            f"- Full throttle: {pct(lap['fullThrottlePct'])}",
            f"- Average brake: {pct(lap['avgBrakePct'])}",
            f"- Heavy brake: {pct(lap['heavyBrakePct'])}",
            f"- Coasting: {pct(lap['coastingPct'])}",
            f"- Throttle/brake overlap: {pct(lap['throttleBrakeOverlapPct'])}",
            f"- Longest throttle/brake overlap: {format_time(lap['longestThrottleBrakeOverlapSec'])}",
            f"- Longest coast: {format_time(lap['longestCoastSec'])}",
            f"- Average absolute steering: {format_number(lap['avgAbsSteering'], 3)}",
            f"- Max absolute steering: {format_number(lap['maxAbsSteering'], 3)}",
            f"- DRS active: {pct(lap['drsPct'])}",
            f"- DRS activations: {lap.get('drsReactionCount', 0)}",
            f"- DRS avg reaction time: {format_number(lap.get('drsAvgReactionTimeSec'), 3, ' sec')}",
            f"- DRS fastest reaction: {format_number(lap.get('drsFastestReactionTimeSec'), 3, ' sec')}",
            f"- DRS slowest reaction: {format_number(lap.get('drsSlowestReactionTimeSec'), 3, ' sec')}",
            "",
        ])

        if lap["brakingZones"]:
            rows = []
            for index, zone in enumerate(lap["brakingZones"], start=1):
                corner = zone.get("cornerName") or ""
                rows.append([
                    index,
                    corner,
                    format_number(zone["startLapDistanceM"], 1, " m"),
                    format_number(zone["endLapDistanceM"], 1, " m"),
                    format_number(zone["distanceM"], 1, " m"),
                    format_number(zone["entrySpeedKph"], 0, " kph"),
                    format_number(zone["minSpeedKph"], 0, " kph"),
                    format_number(zone["exitSpeedKph"], 0, " kph"),
                    pct((zone["peakBrake"] or 0) * 100),
                ])
            lines.extend([
                "Braking zones:",
                "",
                markdown_table(
                    ["#", "Corner", "Start", "End", "Distance", "Entry", "Min", "Exit", "Peak brake"],
                    rows,
                ),
                "",
            ])

        if lap["corneringZones"]:
            rows = []
            for index, zone in enumerate(lap["corneringZones"], start=1):
                corner = zone.get("cornerName") or ""
                rows.append([
                    index,
                    corner,
                    format_number(zone["startLapDistanceM"], 1, " m"),
                    format_number(zone["endLapDistanceM"], 1, " m"),
                    format_number(zone["avgSpeedKph"], 0, " kph"),
                    format_number(zone["minSpeedKph"], 0, " kph"),
                    format_number(zone["avgThrottle"], 2),
                    format_number(zone["peakAbsSteering"], 3),
                ])
            lines.extend([
                "Cornering zones:",
                "",
                markdown_table(
                    ["#", "Corner", "Start", "End", "Avg speed", "Min speed", "Avg throttle", "Peak steering"],
                    rows,
                ),
                "",
            ])

        if lap.get("drsReactions"):
            rows = []
            for index, reaction in enumerate(lap["drsReactions"], start=1):
                rows.append([
                    index,
                    format_number(reaction["lapDistanceM"], 1, " m"),
                    format_number(reaction["reactionTimeSec"], 3, " sec"),
                ])
            lines.extend([
                "DRS reaction times:",
                "",
                markdown_table(
                    ["#", "Activation distance", "Reaction time"],
                    rows,
                ),
                "",
            ])

    lines.extend([
        "## Recommended AI Output Format",
        "",
        "Ask the AI coach to reply with:",
        "",
        "1. Session overview in 3 short bullets.",
        "2. Top 3 improvements, each backed by telemetry evidence from this file.",
        "3. One lap-specific coaching note.",
        "4. One drill for the next session.",
        "5. A short confidence score explaining how complete the telemetry data was.",
        "",
    ])

    return "\n".join(lines)


def make_json_safe(value):
    if isinstance(value, dict):
        return {key: make_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [make_json_safe(item) for item in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, float):
        return round(value, 4)
    return value


def send_to_ai_coach(report_markdown):
    """Send the generated report to an AI coach via OpenRouter and return the response text."""
    if requests is None:
        print("Skipping AI coach: 'requests' library not installed. Run: pip install requests")
        return None

    if not OPENROUTER_API_KEY:
        print("Skipping AI coach: OPENROUTER_API_KEY environment variable not set.")
        return None

    print(f"Sending report to AI coach ({OPENROUTER_MODEL}) via OpenRouter...")

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [
                    {"role": "system", "content": AI_COACH_SYSTEM_PROMPT},
                    {"role": "user", "content": report_markdown},
                ],
            },
            timeout=90,
        )
        response.raise_for_status()
        data = response.json()

        reply = data["choices"][0]["message"]["content"]
        print("AI coach response received.")
        return reply

    except requests.exceptions.Timeout:
        print("AI coach request timed out.")
        return None
    except requests.exceptions.HTTPError as e:
        print(f"AI coach HTTP error: {e}")
        if e.response is not None:
            print(f"  Response body: {e.response.text[:500]}")
        return None
    except Exception as e:
        print(f"AI coach error: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Build an AI-friendly F1 post-session telemetry report.")
    parser.add_argument("--csv", default=None, help="Input telemetry CSV path (default: telemetry_live.csv).")
    parser.add_argument("--session", default=None, help="Session ID to fetch telemetry from the backend API instead of CSV.")
    parser.add_argument("--token", default=None, help="Auth token for the backend API (or set F1_AUTH_TOKEN env var).")
    parser.add_argument("--max-samples", type=int, default=2000, help="Max samples to fetch from API (default: 2000).")
    parser.add_argument("--md", default=DEFAULT_MARKDOWN_OUTPUT, help="Output Markdown report path.")
    parser.add_argument("--json", default=DEFAULT_JSON_OUTPUT, help="Output JSON report path.")
    parser.add_argument("--ai", action="store_true", help="Send report to AI coach via OpenRouter after generating.")
    parser.add_argument("--model", default=None, help="Override OpenRouter model (e.g. google/gemini-2.5-flash, anthropic/claude-sonnet-4).")
    parser.add_argument("--ai-output", default=DEFAULT_AI_OUTPUT, help="Output path for AI coach response.")
    args = parser.parse_args()

    # Override model if provided via CLI
    global OPENROUTER_MODEL
    if args.model:
        OPENROUTER_MODEL = args.model

    # Load samples from API or CSV
    if args.session:
        samples, session_assists, lap_times, session_meta = load_samples_from_api(args.session, max_samples=args.max_samples, auth_token=args.token)
        track_name = session_meta.get("trackName")
    else:
        csv_path = Path(args.csv or DEFAULT_INPUT)
        if not csv_path.exists():
            raise SystemExit(f"Input CSV not found: {csv_path}")
        samples = load_samples(csv_path)
        session_assists = None
        lap_times = None
        track_name = None

    if not samples:
        raise SystemExit("No usable telemetry samples found.")

    report = summarize_session(samples, assists=session_assists, lap_times=lap_times, track_name=track_name)

    markdown_path = Path(args.md)
    json_path = Path(args.json)

    report_markdown = render_markdown(report)
    markdown_path.write_text(report_markdown, encoding="utf-8")
    json_path.write_text(json.dumps(make_json_safe(report), indent=2), encoding="utf-8")

    print(f"Wrote {markdown_path}")
    print(f"Wrote {json_path}")

    # Send to AI coach if requested
    if args.ai:
        ai_response = send_to_ai_coach(report_markdown)
        if ai_response:
            ai_output_path = Path(args.ai_output)
            ai_output_path.write_text(ai_response, encoding="utf-8")
            print(f"Wrote {ai_output_path}")
        else:
            print("No AI coach response was generated.")


if __name__ == "__main__":
    main()

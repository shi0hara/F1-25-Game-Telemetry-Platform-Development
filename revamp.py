"""
revamp.py — F1 25 UDP Telemetry Listener
==========================================
This is the core real-time telemetry listener for the F1 25 Game Telemetry Platform.
It captures UDP telemetry packets broadcast by the F1 25 game, decodes them,
and streams the data to both:
  1. A backend REST API (hosted on Render) for persistent storage
  2. A local HTTP/SSE server for real-time website pairing

Architecture Overview:
    F1 25 Game → UDP packets → This listener → Backend API (Render/Express)
                                             → Local pairing server (HTTP/SSE)
                                             → CSV file (local backup)

Key Responsibilities:
    - Decode F1 25 binary UDP packets (motion, telemetry, lap data, etc.)
    - Track session state (start/end detection, lap transitions, track info)
    - Batch and send telemetry samples to the backend API
    - Provide real-time telemetry via local SSE stream for the website
    - Pair with the web frontend via a local HTTP server
    - Detect and report driving assists, DRS usage, and corner events
    - Generate post-session AI reports when a session ends

Usage:
    python revamp.py

Environment Variables:
    API_BASE                  - Backend API URL (default: https://f1-telementry-1.onrender.com)
    F1_LISTENER_TOKEN         - Authentication token for the backend API
    DRIVER_USERNAME           - Pre-configured username (optional)
    LOCAL_PAIR_HOST           - Local pairing server host (default: 127.0.0.1)
    LOCAL_PAIR_PORT           - Local pairing server port (default: 51377)
"""

import csv
import socket
import time
import ctypes
import queue
import threading
import os
import json
import getpass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Load environment variables from .env file if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# HTTP client with automatic retry logic for resilient API communication
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# F1 packet parser library — provides binary struct definitions for F1 UDP packets
from f1.packets import PacketHeader, HEADER_FIELD_TO_PACKET_TYPE

# ──────────────────────────────────────────────────────────────────────────────
# Configuration Constants
# ──────────────────────────────────────────────────────────────────────────────

API_BASE = os.getenv("API_BASE", "https://f1-telementry-1.onrender.com")  # Backend server URL
UDP_IP = "0.0.0.0"           # Listen on all network interfaces for UDP packets
UDP_PORT = 20777             # F1 25 default UDP telemetry port
CSV_PATH = "telemetry_live.csv"  # Local CSV file path for raw telemetry backup

# Path to store listener pairing configuration (token, username, email)
LISTENER_CONFIG_PATH = os.getenv(
    "LISTENER_CONFIG_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".listener-config.json"),
)

# Local HTTP server settings for website ↔ listener pairing
LOCAL_PAIR_HOST = os.getenv("LOCAL_PAIR_HOST", "127.0.0.1")
LOCAL_PAIR_PORT = int(os.getenv("LOCAL_PAIR_PORT", "51377"))

# Debug/logging settings
PRINT_HEADERS = False
HEADER_PRINT_EVERY_SEC = 0.5

# ──────────────────────────────────────────────────────────────────────────────
# F1 UDP Packet Type IDs
# These correspond to the packet_id field in the F1 25 UDP packet header.
# Each packet type carries different telemetry data.
# ──────────────────────────────────────────────────────────────────────────────

MOTION_PACKET_ID = 0            # Car positions, velocities, orientations (world space)
SESSION_PACKET_ID = 1           # Session info: track, weather, session type, assists
LAP_DATA_PACKET_ID = 2          # Per-car lap data: distances, times, sectors
EVENT_PACKET_ID = 3             # Game events: session start/end, penalties, etc.
TELEMETRY_PACKET_ID = 6         # Car telemetry: speed, throttle, brake, gear, RPM
CAR_STATUS_PACKET_ID = 7        # Car status: DRS, traction control, fuel
FINAL_CLASS_PACKET_ID = 8       # Final race classification (end of race)
SESSION_HISTORY_PACKET_ID = 11  # Historical lap/sector times for all completed laps

# Session types that represent actual race sessions (used for detection logic)
RACE_SESSION_TYPES = {15, 16, 17}

# Timing thresholds for session end detection
MIN_EVENT_END_AFTER_START_SEC = 10.0  # Ignore SEND events within 10s of session start
SESSION_END_GRACE_PERIOD_SEC = float(os.getenv("SESSION_END_GRACE_PERIOD_SEC", "3.0"))

# HTTP request timeouts: (connect_timeout, read_timeout) in seconds
REQUEST_TIMEOUT = (5.0, 10.0)
LATEST_REQUEST_TIMEOUT = (1.0, 2.0)  # Shorter timeout for live telemetry updates

# UDP & sampling configuration
SOCKET_TIMEOUT_SEC = 1.0          # UDP socket recv timeout (for periodic status checks)
SAMPLE_MIN_INTERVAL_SEC = 0.1    # Minimum time between samples sent to backend (100ms)
CSV_FLUSH_EVERY_ROWS = 25        # Flush CSV to disk every N rows
PACKET_STATUS_EVERY_SEC = float(os.getenv("LISTENER_PACKET_STATUS_EVERY_SEC", "5.0"))

# Telemetry batch settings — samples are collected and sent in batches for efficiency
BATCH_SIZE = 20
TELEMETRY_BATCH = []

PARTICIPANTS_PACKET_ID = 4  # Contains driver names for all cars in session

# Human-readable labels for packet types (used in status logging)
PACKET_ID_LABELS = {
    MOTION_PACKET_ID: "motion",
    SESSION_PACKET_ID: "session",
    LAP_DATA_PACKET_ID: "lap",
    EVENT_PACKET_ID: "event",
    PARTICIPANTS_PACKET_ID: "participants",
    TELEMETRY_PACKET_ID: "telemetry",
    CAR_STATUS_PACKET_ID: "car-status",
    FINAL_CLASS_PACKET_ID: "final-classification",
    SESSION_HISTORY_PACKET_ID: "session-history",
}

# ──────────────────────────────────────────────────────────────────────────────
# Driver Identity & Authentication
# ──────────────────────────────────────────────────────────────────────────────

DRIVER_USERNAME = os.getenv("DRIVER_USERNAME")
DRIVER_EMAIL = os.getenv("DRIVER_EMAIL")
LISTENER_TOKEN = os.getenv("LISTENER_TOKEN") or os.getenv("F1_LISTENER_TOKEN")
LISTENER_CONFIG_LOADED = False
# Whether to trust a saved listener token without waiting for website confirmation
TRUST_SAVED_LISTENER_TOKEN = os.getenv("LISTENER_TRUST_SAVED_TOKEN", "false").lower() in (
    "1",
    "true",
    "yes",
    "on",
)

PLAYER_NAME_DETECTED = False  # Set True once we detect the player's in-game name

# ──────────────────────────────────────────────────────────────────────────────
# Track ID → Name Mapping
# Maps the F1 25 game's internal track IDs to human-readable circuit names.
# ──────────────────────────────────────────────────────────────────────────────

TRACK_ID_TO_NAME = {
    0: "Melbourne",
    2: "Shanghai",
    3: "Sakhir (Bahrain)",
    4: "Catalunya",
    5: "Monaco",
    6: "Montreal",
    7: "Silverstone",
    9: "Hungaroring",
    10: "Spa",
    11: "Monza",
    12: "Singapore",
    13: "Suzuka",
    14: "Abu Dhabi",
    15: "Texas",
    16: "Brazil",
    17: "Austria",
    19: "Mexico",
    20: "Baku (Azerbaijan)",
    26: "Zandvoort",
    27: "Imola",
    29: "Jeddah",
    30: "Miami",
    31: "Las Vegas",
    32: "Losail",
    39: "Silverstone (Reverse)",
    40: "Austria (Reverse)",
    41: "Zandvoort (Reverse)",
}

# ──────────────────────────────────────────────────────────────────────────────
# Runtime State Variables
# These globals track the current game session state and are reset between sessions.
# ──────────────────────────────────────────────────────────────────────────────

TRACK_NAME = None          # Current circuit name (e.g., "Suzuka")
TRACK_ID = None            # Current circuit ID from the game
SESSION_TYPE = None        # Game session type (practice, qualifying, race)
CUSTOM_SETUP = None        # Whether the player is using a custom car setup
EQUAL_PERFORMANCE = None   # Whether equal car performance is enabled

# Current car position from Lap Data packets
CURRENT_LAP_DISTANCE_M = None    # Distance into the current lap (metres)
CURRENT_TOTAL_DISTANCE_M = None  # Total distance driven in session
CURRENT_SECTOR = None            # Current track sector (0, 1, or 2)
CURRENT_PIT_STATUS = None        # Pit lane status (0=track, 1=pitting, 2=in pit)

# World-space car position from Motion packets (used for the live telemetry map)
CURRENT_WORLD_X = None
CURRENT_WORLD_Y = None
CURRENT_WORLD_Z = None
CURRENT_YAW = None
CURRENT_PITCH = None
CURRENT_ROLL = None
LAST_MOTION_PACKET_AT = None       # Timestamp of last motion packet received
LAST_VALID_MOTION_AT = None        # Timestamp of last successfully decoded motion data
LAST_MOTION_DEBUG_AT = 0.0         # Rate-limit for motion warning messages
LAST_TELEMETRY_NO_MOTION_WARN_AT = 0.0  # Rate-limit for missing motion warnings

# Corner detection state (tracks when the car is mid-corner based on steering input)
CORNER_ACTIVE = False
CORNER_START = None
CORNER_COUNTER = 0

# Steering thresholds for corner detection (normalised 0-1 scale)
CORNER_START_THRESHOLD = 0.25   # Steering above this = corner started
CORNER_END_THRESHOLD = 0.15     # Steering below this = corner ended

# Tracks the last session metadata sent to avoid redundant PATCH requests
LAST_SESSION_META_SYNCED = {
    "trackId": None,
    "trackName": None,
    "sessionType": None,
}


# ──────────────────────────────────────────────────────────────────────────────
# Helper Functions: Track & Packet Utilities
# ──────────────────────────────────────────────────────────────────────────────


def get_track_name(track_id):
    """Convert a numeric track ID to its human-readable name."""
    if track_id is None:
        return None
    return TRACK_ID_TO_NAME.get(int(track_id))

def decode_text(value):
    """Decode a bytes/bytearray/ctypes array value to a clean UTF-8 string.
    Strips null bytes and whitespace. Returns None if empty."""
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="ignore").strip("\x00 ").strip() or None
    if isinstance(value, str):
        s = value.strip("\x00 ").strip()
        return s or None
    try:
        return bytes(value).decode("utf-8", errors="ignore").strip("\x00 ").strip() or None
    except Exception:
        s = str(value).strip("\x00 ").strip()
        return s or None

def get_attr(obj, *names, default=None):
    """Get an attribute from an object by trying multiple possible names.
    The F1 packet library uses different naming conventions across versions."""
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    return default

def parse_number(value, fallback=None):
    if value is None:
        return fallback
    try:
        return float(value)
    except Exception:
        return fallback

def parse_int(value, fallback=None):
    n = parse_number(value, None)
    if n is None:
        return fallback
    try:
        return int(n)
    except Exception:
        return fallback

def normalize_field_name(name):
    """Normalise a field name by lowercasing and stripping non-alphanumeric chars.
    Used for fuzzy matching between different packet library naming conventions."""
    return "".join(ch.lower() for ch in str(name) if ch.isalnum())

def iter_field_names(obj):
    """Iterate over all accessible field names of a ctypes struct or Python object.
    Checks _fields_ (ctypes), __dict__, and dir() in that order."""
    seen = set()

    for field in getattr(obj, "_fields_", []) or []:
        name = field[0] if isinstance(field, (tuple, list)) and field else field
        if isinstance(name, str) and name not in seen:
            seen.add(name)
            yield name

    for name in getattr(obj, "__dict__", {}).keys():
        if isinstance(name, str) and name not in seen:
            seen.add(name)
            yield name

    for name in dir(obj):
        if name.startswith("_") or name in seen:
            continue
        seen.add(name)
        yield name

def get_attr_loose(obj, *names, default=None):
    """Fuzzy attribute lookup: first tries exact match, then normalised name matching.
    Essential for cross-version packet compatibility where field naming varies."""
    exact = get_attr(obj, *names, default=None)
    if exact is not None:
        return exact

    targets = {normalize_field_name(name) for name in names}
    for field_name in iter_field_names(obj):
        if normalize_field_name(field_name) in targets:
            try:
                return getattr(obj, field_name)
            except Exception:
                pass

    return default

def parse_number_attr(obj, names, fallback=None):
    return parse_number(get_attr_loose(obj, *names, default=None), fallback)

def summarize_field_names(obj, limit=24):
    names = list(iter_field_names(obj))
    if len(names) > limit:
        return ", ".join(names[:limit]) + ", ..."
    return ", ".join(names)

def safe_enqueue(qobj, item):
    """Non-blocking queue put. Returns True if successful, False if queue is full."""
    try:
        qobj.put_nowait(item)
        return True
    except queue.Full:
        return False

def iso_now():
    """Return the current UTC time as an ISO 8601 string with Z suffix."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def packet_label(pid):
    return PACKET_ID_LABELS.get(pid, f"packet-{pid}")

def format_packet_counts(packet_counts):
    if not packet_counts:
        return "-"

    ordered = sorted(packet_counts.items(), key=lambda item: item[1], reverse=True)
    return ", ".join(
        f"{packet_label(pid)}:{count}"
        for pid, count in ordered[:8]
    )

def describe_header(header):
    fmt = get_attr_loose(header, "packet_format", "packetFormat", "m_packetFormat", "mPacketFormat", default="?")
    year = get_attr_loose(header, "game_year", "gameYear", "m_gameYear", "mGameYear", default="?")
    version = get_attr_loose(header, "packet_version", "packetVersion", "m_packetVersion", "mPacketVersion", default="?")
    pid = get_attr_loose(header, "packet_id", "packetId", "m_packetId", "mPacketId", default="?")
    return f"format={fmt}, gameYear={year}, version={version}, packetId={pid}"

def extract_track_info_from_session_packet(pkt):
    track_id = parse_int(
        get_attr_loose(
            pkt,
            "track_id",
            "trackId",
            "m_trackId",
            "mTrackId",
            "m_track_id",
            default=None,
        ),
        None,
    )
    return track_id, get_track_name(track_id)

def post_corner(corner_body):
    if not SESSION_ID:
        return
    safe_enqueue(CORNER_QUEUE, (
        f"/sessions/{SESSION_ID}/corners",
        corner_body,
        2,
    ))

def flush_active_corner(end_sample=None, end_reason="shutdown"):
    global CORNER_ACTIVE, CORNER_START

    if not CORNER_ACTIVE or not CORNER_START:
        return

    end_sample = end_sample or {}
    end_epoch = time.time()

    payload = {
        "cornerIndex": CORNER_START["cornerIndex"],
        "trackId": CORNER_START.get("trackId"),
        "trackName": CORNER_START.get("trackName"),
        "startedAt": CORNER_START.get("startedAt"),
        "endedAt": end_sample.get("timestamp", iso_now()),
        "durationMs": int(max(0, (end_epoch - CORNER_START["startedAtEpoch"]) * 1000)),
        "startLapNumber": CORNER_START.get("startLapNumber"),
        "endLapNumber": end_sample.get("lapNumber", CURRENT_LAP_NUM),
        "startLapDistanceM": CORNER_START.get("startLapDistanceM"),
        "endLapDistanceM": end_sample.get("lapDistance", CURRENT_LAP_DISTANCE_M),
        "startTotalDistanceM": CORNER_START.get("startTotalDistanceM"),
        "endTotalDistanceM": end_sample.get("totalDistance", CURRENT_TOTAL_DISTANCE_M),
        "startSpeedKph": CORNER_START.get("startSpeedKph"),
        "endSpeedKph": end_sample.get("speedKph"),
        "maxAbsSteering": CORNER_START.get("maxAbsSteering", 0.0),
        "endReason": end_reason,
    }

    post_corner(payload)
    CORNER_ACTIVE = False
    CORNER_START = None

def update_corner_state_from_sample(sample_body):
    global CORNER_ACTIVE, CORNER_START, CORNER_COUNTER

    lap_distance = sample_body.get("lapDistance")
    lap_number = sample_body.get("lapNumber")
    steering_abs = abs(sample_body.get("steering") or 0.0)

    if lap_distance is None or lap_number is None:
        return

    if CORNER_ACTIVE and lap_number != CORNER_START.get("startLapNumber"):
        flush_active_corner(sample_body, end_reason="lap_change")
        return

    if not CORNER_ACTIVE:
        if steering_abs >= CORNER_START_THRESHOLD:
            CORNER_COUNTER += 1
            CORNER_ACTIVE = True
            CORNER_START = {
                "cornerIndex": CORNER_COUNTER,
                "trackId": TRACK_ID,
                "trackName": TRACK_NAME,
                "startedAt": sample_body["timestamp"],
                "startedAtEpoch": time.time(),
                "startLapNumber": lap_number,
                "startLapDistanceM": lap_distance,
                "startTotalDistanceM": sample_body.get("totalDistance"),
                "startSpeedKph": sample_body.get("speedKph"),
                "maxAbsSteering": steering_abs,
            }
    else:
        CORNER_START["maxAbsSteering"] = max(CORNER_START["maxAbsSteering"], steering_abs)

        if steering_abs <= CORNER_END_THRESHOLD:
            flush_active_corner(sample_body, end_reason="steering_released")

def sync_session_metadata():
    global LAST_SESSION_META_SYNCED

    if not SESSION_ID:
        return

    payload = {
        "trackId": TRACK_ID,
        "trackName": TRACK_NAME,
        "sessionType": SESSION_TYPE,
        "customSetup": CUSTOM_SETUP,
        "equalPerformance": EQUAL_PERFORMANCE,
    }

    if payload == LAST_SESSION_META_SYNCED:
        return

    try:
        res = http.patch(
            f"{API_BASE}/sessions/{SESSION_ID}",
            headers=listener_auth_headers(),
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        res.raise_for_status()
        LAST_SESSION_META_SYNCED = dict(payload)
    except Exception as e:
        print("Session metadata sync error:", e)

def get_player_car_index(header, fallback=0):
    return int(get_attr_loose(
        header,
        "player_car_index",
        "playerCarIndex",
        "m_playerCarIndex",
        "mPlayerCarIndex",
        default=fallback,
    ) or fallback)

def get_motion_array(pkt):
    return get_attr_loose(
        pkt,
        "car_motion_data",
        "carMotionData",
        "m_carMotionData",
        "m_car_motion_data",
        default=None,
    )

def warn_motion_decode(message, pkt=None, car=None):
    global LAST_MOTION_DEBUG_AT

    now = time.time()
    if now - LAST_MOTION_DEBUG_AT < 8.0:
        return

    LAST_MOTION_DEBUG_AT = now
    print("Map warning:", message)
    if pkt is not None:
        print("  Motion packet fields:", summarize_field_names(pkt))
    if car is not None:
        print("  Car motion fields:", summarize_field_names(car))

def update_motion_state_from_packet(header, pkt):
    """
    Reads Motion packet 0 and stores the player's latest world-space position.
    Without these fields, Firebase cannot store lap trails for the telemetry map.
    """
    global CURRENT_WORLD_X, CURRENT_WORLD_Y, CURRENT_WORLD_Z
    global CURRENT_YAW, CURRENT_PITCH, CURRENT_ROLL
    global LAST_MOTION_PACKET_AT, LAST_VALID_MOTION_AT

    LAST_MOTION_PACKET_AT = time.time()

    arr = get_motion_array(pkt)
    if arr is None or len(arr) == 0:
        warn_motion_decode("Motion packet arrived, but no car motion array was found.", pkt=pkt)
        return

    player_idx = get_player_car_index(header)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    car = arr[player_idx]

    world_x = parse_number_attr(car, (
        "world_position_x",
        "worldPositionX",
        "m_worldPositionX",
        "m_world_position_x",
    ), None)
    world_y = parse_number_attr(car, (
        "world_position_y",
        "worldPositionY",
        "m_worldPositionY",
        "m_world_position_y",
    ), None)
    world_z = parse_number_attr(car, (
        "world_position_z",
        "worldPositionZ",
        "m_worldPositionZ",
        "m_world_position_z",
    ), None)

    if world_x is None or world_z is None:
        warn_motion_decode("Motion packet arrived, but world position fields could not be decoded.", pkt=pkt, car=car)
        return

    CURRENT_WORLD_X = world_x
    CURRENT_WORLD_Y = world_y
    CURRENT_WORLD_Z = world_z
    CURRENT_YAW = parse_number_attr(car, ("yaw", "m_yaw", "mYaw"), None)
    CURRENT_PITCH = parse_number_attr(car, ("pitch", "m_pitch", "mPitch"), None)
    CURRENT_ROLL = parse_number_attr(car, ("roll", "m_roll", "mRoll"), None)
    LAST_VALID_MOTION_AT = LAST_MOTION_PACKET_AT
    update_local_live_motion_position(header)

def warn_if_telemetry_has_no_map_position():
    global LAST_TELEMETRY_NO_MOTION_WARN_AT

    if CURRENT_WORLD_X is not None and CURRENT_WORLD_Z is not None:
        return

    now = time.time()
    if now - LAST_TELEMETRY_NO_MOTION_WARN_AT < 10.0:
        return

    LAST_TELEMETRY_NO_MOTION_WARN_AT = now
    if LAST_MOTION_PACKET_AT is None:
        print("Map warning: telemetry is arriving, but no Motion packet 0 has arrived yet. Check F1 25 UDP settings.")
    else:
        print("Map warning: telemetry is arriving, but Motion packet 0 has not produced worldX/worldZ yet.")

def extract_player_name_from_participants(header, pkt):
    arr = get_attr(pkt, "participants", "m_participants")
    if arr is None or len(arr) == 0:
        return None

    player_idx = get_player_car_index(header)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    participant = arr[player_idx]

    for field in ("name", "m_name", "driver_name", "m_driverName"):
        raw = get_attr(participant, field, default=None)
        name = decode_text(raw)
        if name:
            return name

    return None

def detect_key_shape(mapping):
    k = next(iter(mapping.keys()))
    if isinstance(k, int):
        return ("int", 1)
    if isinstance(k, tuple):
        return ("tuple", len(k))
    return (type(k).__name__, None)

KEY_TYPE, KEY_LEN = detect_key_shape(HEADER_FIELD_TO_PACKET_TYPE)

def is_fake_name(name):
    if not name:
        return True
    return name.startswith("Room-") or name.startswith("User-")

def pick_packet_class(header):
    """Determine the correct packet class to decode a raw UDP packet.
    
    The F1 packet library maps (format, version, packet_id) tuples to packet classes.
    This function handles various key shapes (int, 2-tuple, 3-tuple, 4-tuple)
    depending on the library version installed.
    """
    fmt = int(get_attr_loose(header, "packet_format", "packetFormat", "m_packetFormat", "mPacketFormat", default=0) or 0)
    ver = int(get_attr_loose(header, "packet_version", "packetVersion", "m_packetVersion", "mPacketVersion", default=0) or 0)
    pid = int(get_attr_loose(header, "packet_id", "packetId", "m_packetId", "mPacketId", default=0) or 0)
    year = int(get_attr_loose(header, "game_year", "gameYear", "m_gameYear", "mGameYear", default=0) or 0)

    m = HEADER_FIELD_TO_PACKET_TYPE

    if KEY_TYPE == "int":
        return m.get(pid)

    if KEY_TYPE == "tuple":
        candidates = []
        if KEY_LEN == 2:
            candidates += [(fmt, pid), (pid, fmt), (ver, pid), (pid, ver), (year, pid), (pid, year)]
        elif KEY_LEN == 3:
            candidates += [
                (fmt, ver, pid), (fmt, pid, ver),
                (ver, fmt, pid), (pid, fmt, ver),
                (year, ver, pid), (year, pid, ver),
                (year, fmt, pid), (fmt, year, pid),
            ]
        elif KEY_LEN == 4:
            candidates += [
                (fmt, year, ver, pid), (fmt, ver, year, pid),
                (year, fmt, ver, pid), (year, ver, fmt, pid),
            ]

        for key in candidates:
            cls = m.get(key)
            if cls is not None:
                return cls

        best_cls = None
        best_score = -1
        for k, cls in m.items():
            if not isinstance(k, tuple) or pid not in k:
                continue
            score = 0
            if fmt in k:
                score += 3
            if ver in k:
                score += 2
            if year in k:
                score += 1
            if score > best_score:
                best_score = score
                best_cls = cls
        return best_cls

    return None


# ──────────────────────────────────────────────────────────────────────────────
# Corner Detection & Tracking
# Corners are detected by monitoring steering input. When steering exceeds
# the threshold, a corner is started. When it drops below, it's ended.
# Corner data is sent to the backend for per-corner performance analysis.
# ──────────────────────────────────────────────────────────────────────────────


def extract_event_code(event_pkt):
    """Extract the 4-character event code from an Event packet (e.g., 'SEND' for session end)."""
    raw = get_attr(
        event_pkt,
        "event_string_code",
        "m_eventStringCode",
        "event_code",
        "m_eventCode",
        default=None,
    )
    if raw is None:
        return ""

    if isinstance(raw, (bytes, bytearray)):
        return raw.decode("ascii", errors="ignore").strip("\x00 ")
    if isinstance(raw, str):
        return raw.strip("\x00 ")
    try:
        return bytes(raw).decode("ascii", errors="ignore").strip("\x00 ")
    except Exception:
        return str(raw).strip("\x00 ")

def get_frame_identifier(header, pkt=None):
    for obj in (header, pkt):
        if obj is None:
            continue
        for name in ("frame_identifier", "m_frameIdentifier"):
            if hasattr(obj, name):
                try:
                    return int(getattr(obj, name))
                except Exception:
                    pass
    return None


# ──────────────────────────────────────────────────────────────────────────────
# HTTP Session & Worker Threads
# The listener uses background threads for non-blocking API communication:
#   - LATEST_QUEUE: single latest telemetry sample (always newest only)
#   - BATCH_QUEUE: batched telemetry samples for bulk storage
#   - LAP_QUEUE: completed lap records
#   - CORNER_QUEUE: completed corner events
# ──────────────────────────────────────────────────────────────────────────────

# Configure requests session with automatic retry and connection pooling
http = requests.Session()
retries = Retry(
    total=3,
    connect=3,
    read=3,
    backoff_factor=0.25,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET", "POST", "PUT", "PATCH", "DELETE"]),
)
adapter = HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20)
http.mount("http://", adapter)
http.mount("https://", adapter)
http.headers.update({"Content-Type": "application/json"})

# ──────────────────────────────────────────────────────────────────────────────
# Session & Telemetry State
# ──────────────────────────────────────────────────────────────────────────────

SESSION_ID = None                      # Current backend session document ID
USER_ID = None                         # Authenticated user ID on the backend
SESSION_END_DETECTED_AT = None         # ISO timestamp when session end was detected
SESSION_END_DETECTED_MONO = None       # Monotonic time of session end (for grace period)
SESSION_END_REASON = None              # Why the session ended (e.g., "session_end_event")
SESSION_END_PACKET_TYPE = None         # Which packet triggered the end
LAST_SAMPLE_TIMESTAMP = None           # ISO timestamp of the last telemetry sample
CURRENT_GAME_SESSION_UID = None        # F1 game's unique session identifier
LAST_CLOSED_GAME_SESSION_UID = None    # Previous session UID (prevents re-opening)
LAST_CLOSED_SESSION_SIGNATURE = None   # (track_id, session_type) of last closed session
LAST_CLOSED_SESSION_MONO = None        # Monotonic time when last session was closed
LAST_SESSION_PACKET_SIGNATURE = None   # For deduplicating session packet log messages
LAST_SESSION_PACKET_NOTICE_AT = 0.0

# Threading primitives for concurrent access to shared state
STOP_EVENT = threading.Event()             # Signals all threads to stop gracefully
IDENTITY_LOCK = threading.Lock()           # Protects driver identity fields
LOCAL_LIVE_LOCK = threading.Lock()         # Protects local live telemetry state
LOCAL_LIVE_CONDITION = threading.Condition(LOCAL_LIVE_LOCK)  # Notifies SSE clients of new data
LOCAL_LIVE_SAMPLE = None                   # Latest telemetry sample for local HTTP/SSE
LOCAL_LIVE_UPDATED_AT = None               # When the local live sample was last updated
LOCAL_LIVE_SEQUENCE = 0                    # Monotonically increasing sequence number
LOCAL_LIVE_STREAM_HEARTBEAT_SEC = 2.0      # SSE heartbeat interval

# Background work queues — processed by dedicated worker threads
LATEST_QUEUE = queue.Queue(maxsize=1)      # Only keeps the newest live sample
BATCH_QUEUE = queue.Queue(maxsize=2000)    # Batched telemetry for persistent storage
LAP_QUEUE = queue.Queue(maxsize=200)       # Completed lap records
CORNER_QUEUE = queue.Queue(maxsize=500)    # Completed corner events

# Telemetry sampling state
LAST_SAMPLE_SENT_AT = 0.0         # Monotonic time of last backend sample send
CURRENT_LAP_NUM = None            # Current lap number from Lap Data packets
BEST_LAP_TIME_MS = None           # Best lap time seen in this session (for delta calc)
LAST_DELTA_TO_PB_MS = None        # Current delta to personal best (milliseconds)

# Braking distance tracking — accumulates distance while brake is applied
BRAKE_ACTIVE = False
BRAKE_START_DISTANCE_M = 0.0
LAST_BRAKE_SAMPLE_TIME = None

# DRS (Drag Reduction System) state tracking
CURRENT_DRS_AVAILABLE = False                # Whether DRS is allowed in current zone
CURRENT_DRS_ACTIVATION_DISTANCE_M = None     # Distance to DRS activation point
DRS_AVAILABLE_SINCE_MONO = None              # When DRS became available (for reaction time)
DRS_AVAILABLE_SINCE_LAP_DISTANCE_M = None    # Where DRS became available
DRS_ACTIVATION_PENDING = False               # True when DRS is available but not yet opened
LAST_DRS_ACTIVE = False                      # Whether DRS was open in the previous sample

# Driving assist state — read from Session and Car Status packets.
# These are reported alongside telemetry so the AI coach knows the driver's assist level.
CURRENT_TRACTION_CONTROL = None      # 0=Off, 1=Medium, 2=Full
CURRENT_ANTI_LOCK_BRAKES = None      # True/False
CURRENT_GEARBOX_ASSIST = None        # 0/1=Manual, 2=Suggested, 3=Automatic
CURRENT_DRS_ASSIST = None            # True if DRS opens automatically
CURRENT_STEERING_ASSIST = None       # True if steering assist is active
CURRENT_BRAKING_ASSIST = None        # True if braking assist is active
CURRENT_PIT_ASSIST = None            # True if pit assist is active
CURRENT_PIT_RELEASE_ASSIST = None    # True if pit release assist is active
CURRENT_ERS_ASSIST = None            # True if ERS deployment is automatic
CURRENT_DYNAMIC_RACING_LINE = None   # 0=Off, 1=Corners only, 2=Full

def clean_config_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None

def manual_listener_login_enabled():
    return os.getenv("ALLOW_MANUAL_LISTENER_LOGIN", "false").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )

def load_listener_config():
    global DRIVER_USERNAME, DRIVER_EMAIL, LISTENER_TOKEN, LISTENER_CONFIG_LOADED

    if LISTENER_CONFIG_LOADED:
        return

    LISTENER_CONFIG_LOADED = True

    if os.getenv("LISTENER_RESET_CONFIG") == "1":
        print("Listener config skipped because LISTENER_RESET_CONFIG=1.")
        return

    if not os.path.exists(LISTENER_CONFIG_PATH):
        return

    try:
        with open(LISTENER_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Could not read listener config at {LISTENER_CONFIG_PATH}: {e}")
        return

    if not DRIVER_USERNAME:
        DRIVER_USERNAME = clean_config_text(data.get("username"))
    if not DRIVER_EMAIL:
        DRIVER_EMAIL = clean_config_text(data.get("email"))
    saved_token = clean_config_text(data.get("listenerToken"))
    if not LISTENER_TOKEN and saved_token and TRUST_SAVED_LISTENER_TOKEN:
        LISTENER_TOKEN = saved_token
    elif saved_token and not TRUST_SAVED_LISTENER_TOKEN:
        print("Saved listener token found. Waiting for website login to confirm the active account.")

def save_listener_config():
    data = {}
    if DRIVER_USERNAME:
        data["username"] = DRIVER_USERNAME
    if DRIVER_EMAIL:
        data["email"] = DRIVER_EMAIL
    if LISTENER_TOKEN:
        data["listenerToken"] = LISTENER_TOKEN

    if not data:
        return

    try:
        with open(LISTENER_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        try:
            os.chmod(LISTENER_CONFIG_PATH, 0o600)
        except Exception:
            pass
    except Exception as e:
        print(f"Could not save listener config at {LISTENER_CONFIG_PATH}: {e}")

def delete_listener_config():
    try:
        if os.path.exists(LISTENER_CONFIG_PATH):
            os.remove(LISTENER_CONFIG_PATH)
    except Exception as e:
        print(f"Could not delete listener config at {LISTENER_CONFIG_PATH}: {e}")

def clear_listener_identity():
    global DRIVER_USERNAME, DRIVER_EMAIL, LISTENER_TOKEN, USER_ID

    with IDENTITY_LOCK:
        DRIVER_USERNAME = None
        DRIVER_EMAIL = None
        LISTENER_TOKEN = None
        USER_ID = None
        delete_listener_config()

def listener_auth_headers():
    if not LISTENER_TOKEN:
        return {}
    return {"x-listener-token": LISTENER_TOKEN}

def update_local_live_sample(sample_body):
    global LOCAL_LIVE_SAMPLE, LOCAL_LIVE_UPDATED_AT, LOCAL_LIVE_SEQUENCE

    with LOCAL_LIVE_CONDITION:
        LOCAL_LIVE_SEQUENCE += 1
        LOCAL_LIVE_SAMPLE = dict(sample_body or {})
        LOCAL_LIVE_UPDATED_AT = iso_now()
        LOCAL_LIVE_CONDITION.notify_all()

def update_local_live_motion_position(header=None):
    global LOCAL_LIVE_SAMPLE, LOCAL_LIVE_UPDATED_AT, LOCAL_LIVE_SEQUENCE

    if CURRENT_WORLD_X is None or CURRENT_WORLD_Z is None:
        return

    sample_timestamp = iso_now()

    with LOCAL_LIVE_CONDITION:
        LOCAL_LIVE_SEQUENCE += 1
        sample = dict(LOCAL_LIVE_SAMPLE or {})
        sample.update({
            "timestamp": sample_timestamp,
            "motionOnly": True,
            "sampleIndex": get_frame_identifier(header) if header is not None else sample.get("sampleIndex"),
            "lapNumber": CURRENT_LAP_NUM,
            "lapDistance": CURRENT_LAP_DISTANCE_M,
            "totalDistance": CURRENT_TOTAL_DISTANCE_M,
            "worldX": CURRENT_WORLD_X,
            "worldY": CURRENT_WORLD_Y,
            "worldZ": CURRENT_WORLD_Z,
            "yaw": CURRENT_YAW,
            "pitch": CURRENT_PITCH,
            "roll": CURRENT_ROLL,
            "currentSector": CURRENT_SECTOR,
            "pitStatus": CURRENT_PIT_STATUS,
        })
        LOCAL_LIVE_SAMPLE = sample
        LOCAL_LIVE_UPDATED_AT = sample_timestamp
        LOCAL_LIVE_CONDITION.notify_all()

def build_local_live_payload(sample, updated_at, sequence):
    return {
        "ok": True,
        "sequence": sequence,
        "paired": bool(LISTENER_TOKEN or USER_ID),
        "username": DRIVER_USERNAME,
        "email": DRIVER_EMAIL,
        "userId": USER_ID,
        "sessionId": SESSION_ID,
        "apiBase": API_BASE,
        "updatedAt": updated_at,
        "latestTelemetry": sample,
        "latestMapPosition": sample,
    }

def get_local_live_payload():
    with LOCAL_LIVE_LOCK:
        sample = dict(LOCAL_LIVE_SAMPLE) if LOCAL_LIVE_SAMPLE else None
        updated_at = LOCAL_LIVE_UPDATED_AT
        sequence = LOCAL_LIVE_SEQUENCE

    return build_local_live_payload(sample, updated_at, sequence)

def resolve_listener_token(token):
    global DRIVER_USERNAME, DRIVER_EMAIL, LISTENER_TOKEN, USER_ID

    token = clean_config_text(token)
    if not token:
        raise ValueError("listener token is required")

    res = http.post(
        f"{API_BASE}/listener/resolve",
        headers={"x-listener-token": token},
        json={},
        timeout=REQUEST_TIMEOUT,
    )
    res.raise_for_status()
    data = res.json()
    user = data.get("user") or data
    user_id = clean_config_text(user.get("id"))
    username = clean_config_text(user.get("username"))
    email = clean_config_text(user.get("email"))

    if not user_id:
        raise ValueError("listener token resolved without a user id")

    with IDENTITY_LOCK:
        LISTENER_TOKEN = token
        USER_ID = user_id
        if username:
            DRIVER_USERNAME = username
        if email:
            DRIVER_EMAIL = email
        save_listener_config()

    return {
        "id": USER_ID,
        "username": DRIVER_USERNAME,
        "email": DRIVER_EMAIL,
    }

class ListenerPairingHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the local pairing server.
    
    Endpoints:
      GET  /health       → Returns listener status (paired/unpaired, username, session info)
      GET  /live         → Returns the latest telemetry sample as JSON
      GET  /live-stream  → Opens an SSE stream for real-time telemetry updates
      POST /pair         → Accepts a listener token from the website to pair accounts
      POST /unpair       → Clears the pairing (called when user logs out on website)
    
    All endpoints include CORS headers to allow requests from the web frontend.
    The /live-stream endpoint uses Server-Sent Events (SSE) for efficient real-time
    telemetry streaming without polling overhead.
    """
    server_version = "F1TelemetryListener/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def send_cors_headers(self):
        origin = self.headers.get("Origin") or "*"
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def write_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def write_sse_event(self, event_name, payload):
        body = (
            f"event: {event_name}\n"
            f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"
        ).encode("utf-8")
        self.wfile.write(body)
        self.wfile.flush()

    def stream_local_live(self):
        try:
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except Exception:
            pass

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        last_sequence = None

        try:
            payload = get_local_live_payload()
            last_sequence = payload.get("sequence")
            self.write_sse_event("status", payload)

            while not STOP_EVENT.is_set():
                with LOCAL_LIVE_CONDITION:
                    LOCAL_LIVE_CONDITION.wait_for(
                        lambda: LOCAL_LIVE_SEQUENCE != last_sequence or STOP_EVENT.is_set(),
                        timeout=LOCAL_LIVE_STREAM_HEARTBEAT_SEC,
                    )
                    sample = dict(LOCAL_LIVE_SAMPLE) if LOCAL_LIVE_SAMPLE else None
                    updated_at = LOCAL_LIVE_UPDATED_AT
                    sequence = LOCAL_LIVE_SEQUENCE

                if sequence != last_sequence:
                    last_sequence = sequence
                    self.write_sse_event("live", build_local_live_payload(sample, updated_at, sequence))
                else:
                    self.write_sse_event("heartbeat", {
                        "ok": True,
                        "sessionId": SESSION_ID,
                        "updatedAt": updated_at,
                        "sequence": last_sequence,
                    })
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        except Exception as e:
            try:
                self.write_sse_event("error", {"ok": False, "error": str(e)})
            except Exception:
                pass

    def read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(min(length, 1024 * 32))
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/live":
            self.write_json(200, get_local_live_payload())
            return

        if path == "/live-stream":
            self.stream_local_live()
            return

        if path != "/health":
            self.write_json(404, {"ok": False, "error": "not found"})
            return

        self.write_json(200, {
            "ok": True,
            "paired": bool(LISTENER_TOKEN or USER_ID),
            "username": DRIVER_USERNAME,
            "email": DRIVER_EMAIL,
            "userId": USER_ID,
            "sessionId": SESSION_ID,
            "apiBase": API_BASE,
        })

    def do_POST(self):
        if self.path == "/unpair":
            previous_username = DRIVER_USERNAME
            if SESSION_ID:
                try:
                    close_current_backend_session(
                        reason="website_logout",
                        packet_type="website_pairing",
                        detected_at=iso_now(),
                    )
                except Exception as e:
                    print("Could not close active session during website logout:", e)

            clear_listener_identity()
            print("Website logged out. Listener account pairing cleared.")
            self.write_json(200, {
                "ok": True,
                "paired": False,
                "previousUsername": previous_username,
            })
            return

        if self.path != "/pair":
            self.write_json(404, {"ok": False, "error": "not found"})
            return

        try:
            body = self.read_json_body()
            token = clean_config_text(body.get("listenerToken"))
            previous_user_id = USER_ID
            user = resolve_listener_token(token)
            if SESSION_ID and previous_user_id and previous_user_id != user.get("id"):
                try:
                    close_current_backend_session(
                        reason="website_user_changed",
                        packet_type="website_pairing",
                        detected_at=iso_now(),
                    )
                except Exception as e:
                    print("Could not close active session during website user switch:", e)
            print(f"Website paired listener as: {user.get('username') or user.get('id')}")
            self.write_json(200, {
                "ok": True,
                "paired": True,
                "user": user,
            })
        except Exception as e:
            self.write_json(400, {
                "ok": False,
                "error": str(e),
            })

def start_local_pairing_server():
    try:
        server = ThreadingHTTPServer((LOCAL_PAIR_HOST, LOCAL_PAIR_PORT), ListenerPairingHandler)
    except OSError as e:
        print(f"Local website pairing server unavailable on {LOCAL_PAIR_HOST}:{LOCAL_PAIR_PORT}: {e}")
        return None

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Website pairing enabled at http://{LOCAL_PAIR_HOST}:{LOCAL_PAIR_PORT}/health")
    return server

def prompt_identity():
    global DRIVER_USERNAME, DRIVER_EMAIL

    load_listener_config()

    if LISTENER_TOKEN:
        print("Using saved listener token. The website account is already paired.")
        return

    if DRIVER_USERNAME and manual_listener_login_enabled():
        print("Using saved listener username:", DRIVER_USERNAME)
        return

    if manual_listener_login_enabled():
        if not DRIVER_USERNAME:
            DRIVER_USERNAME = input("Username: ").strip()
        if not DRIVER_EMAIL:
            DRIVER_EMAIL = input("Email: ").strip()

        if not DRIVER_USERNAME:
            raise ValueError("Username is required")

        save_listener_config()
        return

    print("No listener account paired yet. Log in on the website while this listener is running.")

def sniff_player_name(sock, timeout_sec=10.0):
    global PLAYER_NAME_DETECTED

    end_at = time.time() + timeout_sec
    old_timeout = sock.gettimeout()
    sock.settimeout(0.5)

    try:
        while time.time() < end_at and not PLAYER_NAME_DETECTED:
            try:
                data, _ = sock.recvfrom(4096)
            except socket.timeout:
                continue
            except Exception:
                continue

            header_size = ctypes.sizeof(PacketHeader)
            if len(data) < header_size:
                continue

            try:
                header = PacketHeader.from_buffer_copy(data[:header_size])
            except Exception:
                continue

            pid = int(get_attr_loose(header, "packet_id", "packetId", "mPacketId", "m_packetId", default=0) or 0)
            if pid != PARTICIPANTS_PACKET_ID:
                continue

            pkt_cls = pick_packet_class(header)
            if pkt_cls is None:
                continue

            try:
                pkt = pkt_cls.from_buffer_copy(data)
            except Exception:
                continue

            name = extract_player_name_from_participants(header, pkt)
            if name:
                PLAYER_NAME_DETECTED = True
                return name
    finally:
        sock.settimeout(old_timeout)

    return None

def post_json(endpoint, body, timeout=REQUEST_TIMEOUT):
    url = f"{API_BASE}{endpoint}"
    res = http.post(url, headers=listener_auth_headers(), json=body, timeout=timeout)
    res.raise_for_status()
    return res

def queue_worker(qobj, label):
    """Background thread worker that processes items from a queue.
    
    For the "latest" queue, it discards all but the newest item (since only
    the most recent telemetry matters for the live display).
    
    For other queues (batch, lap, corner), it processes items in order with
    exponential backoff retry on failure.
    """
    while not STOP_EVENT.is_set() or not qobj.empty():
        try:
            endpoint, body, retries_left = qobj.get(timeout=0.1)
        except queue.Empty:
            continue

        if label == "latest":
            while True:
                try:
                    next_endpoint, next_body, next_retries_left = qobj.get_nowait()
                except queue.Empty:
                    break
                qobj.task_done()
                endpoint, body, retries_left = next_endpoint, next_body, next_retries_left

        delay = 0.25 if label == "latest" else 0.5
        timeout = LATEST_REQUEST_TIMEOUT if label == "latest" else REQUEST_TIMEOUT

        try:
            for attempt in range(retries_left + 1):
                try:
                    post_json(endpoint, body, timeout=timeout)
                    break
                except Exception as e:
                    if attempt >= retries_left:
                        print(f"API error on {label} {endpoint} after {retries_left} retries: {e}")
                    else:
                        time.sleep(delay)
                        delay = min(delay * 2.0, 5.0)
        finally:
            qobj.task_done()

def ensure_user():
    """Ensure the driver has an account on the backend.
    
    Loops until either:
    - A listener token is available (from website pairing) and resolves to a user
    - Manual login is enabled and the username resolves to a user
    
    The backend's /users/ensure endpoint creates the user if they don't exist,
    or returns the existing user if they do.
    """
    global USER_ID, DRIVER_USERNAME, DRIVER_EMAIL

    if USER_ID:
        return USER_ID

    last_wait_notice = 0

    while not STOP_EVENT.is_set():
        load_listener_config()

        if not LISTENER_TOKEN and (not manual_listener_login_enabled() or not DRIVER_USERNAME):
            now = time.time()
            if now - last_wait_notice >= 5:
                print("Waiting for website login to pair this listener...")
                last_wait_notice = now
            time.sleep(0.25)
            continue

        try:
            if LISTENER_TOKEN:
                print(f"Connecting to backend at {API_BASE} using paired listener token ...")
                user_res = http.post(
                    f"{API_BASE}/users/ensure",
                    headers=listener_auth_headers(),
                    json={},
                    timeout=REQUEST_TIMEOUT,
                )
            else:
                print(f"Connecting to backend at {API_BASE} as '{DRIVER_USERNAME}' ...")
                user_res = http.post(
                    f"{API_BASE}/users/ensure",
                    json={
                        "username": DRIVER_USERNAME,
                        "email": DRIVER_EMAIL,
                    },
                    timeout=REQUEST_TIMEOUT,
                )

            user_res.raise_for_status()
            user_data = user_res.json()
            USER_ID = user_data["id"]
            DRIVER_USERNAME = clean_config_text(user_data.get("username")) or DRIVER_USERNAME
            DRIVER_EMAIL = clean_config_text(user_data.get("email")) or DRIVER_EMAIL
            save_listener_config()
            print("Driver account ready:", DRIVER_USERNAME, "| USER ID:", USER_ID)
            return USER_ID
        except Exception as e:
            print(f"API not ready, retrying in 5s... ({e})")
            time.sleep(5)

    return None


def reset_session_end_state():
    global SESSION_END_DETECTED_AT, SESSION_END_DETECTED_MONO
    global SESSION_END_REASON, SESSION_END_PACKET_TYPE

    SESSION_END_DETECTED_AT = None
    SESSION_END_DETECTED_MONO = None
    SESSION_END_REASON = None
    SESSION_END_PACKET_TYPE = None


def reset_runtime_state_for_session(reset_assists=True):
    global LOCAL_LIVE_SAMPLE, LOCAL_LIVE_UPDATED_AT, LOCAL_LIVE_SEQUENCE
    global LAST_SAMPLE_TIMESTAMP, LAST_SAMPLE_SENT_AT
    global CURRENT_LAP_NUM, BEST_LAP_TIME_MS, LAST_DELTA_TO_PB_MS
    global CURRENT_LAP_DISTANCE_M, CURRENT_TOTAL_DISTANCE_M, CURRENT_SECTOR, CURRENT_PIT_STATUS
    global CURRENT_WORLD_X, CURRENT_WORLD_Y, CURRENT_WORLD_Z, CURRENT_YAW, CURRENT_PITCH, CURRENT_ROLL
    global LAST_MOTION_PACKET_AT, LAST_VALID_MOTION_AT, LAST_TELEMETRY_NO_MOTION_WARN_AT
    global CORNER_ACTIVE, CORNER_START, CORNER_COUNTER
    global BRAKE_ACTIVE, BRAKE_START_DISTANCE_M, LAST_BRAKE_SAMPLE_TIME
    global CURRENT_DRS_AVAILABLE, CURRENT_DRS_ACTIVATION_DISTANCE_M
    global DRS_AVAILABLE_SINCE_MONO, DRS_AVAILABLE_SINCE_LAP_DISTANCE_M, DRS_ACTIVATION_PENDING, LAST_DRS_ACTIVE
    global LAST_HISTORY_NUM_LAPS, LAST_SESSION_META_SYNCED, CURRENT_GAME_SESSION_UID
    global CURRENT_TRACTION_CONTROL, CURRENT_ANTI_LOCK_BRAKES, CURRENT_GEARBOX_ASSIST
    global CURRENT_DRS_ASSIST, CURRENT_STEERING_ASSIST, CURRENT_BRAKING_ASSIST
    global CURRENT_PIT_ASSIST, CURRENT_PIT_RELEASE_ASSIST, CURRENT_ERS_ASSIST
    global CURRENT_DYNAMIC_RACING_LINE
    global CUSTOM_SETUP, EQUAL_PERFORMANCE

    TELEMETRY_BATCH.clear()
    SENT_LAP_HISTORY_SET.clear()
    LAST_HISTORY_NUM_LAPS = 0
    with LOCAL_LIVE_CONDITION:
        LOCAL_LIVE_SEQUENCE += 1
        LOCAL_LIVE_SAMPLE = None
        LOCAL_LIVE_UPDATED_AT = iso_now()
        LOCAL_LIVE_CONDITION.notify_all()

    LAST_SAMPLE_TIMESTAMP = None
    LAST_SAMPLE_SENT_AT = 0.0
    CURRENT_LAP_NUM = None
    BEST_LAP_TIME_MS = None
    LAST_DELTA_TO_PB_MS = None

    CURRENT_LAP_DISTANCE_M = None
    CURRENT_TOTAL_DISTANCE_M = None
    CURRENT_SECTOR = None
    CURRENT_PIT_STATUS = None

    CURRENT_WORLD_X = None
    CURRENT_WORLD_Y = None
    CURRENT_WORLD_Z = None
    CURRENT_YAW = None
    CURRENT_PITCH = None
    CURRENT_ROLL = None
    LAST_MOTION_PACKET_AT = None
    LAST_VALID_MOTION_AT = None
    LAST_TELEMETRY_NO_MOTION_WARN_AT = 0.0

    CORNER_ACTIVE = False
    CORNER_START = None
    CORNER_COUNTER = 0

    BRAKE_ACTIVE = False
    BRAKE_START_DISTANCE_M = 0.0
    LAST_BRAKE_SAMPLE_TIME = None

    CURRENT_DRS_AVAILABLE = False
    CURRENT_DRS_ACTIVATION_DISTANCE_M = None
    DRS_AVAILABLE_SINCE_MONO = None
    DRS_AVAILABLE_SINCE_LAP_DISTANCE_M = None
    DRS_ACTIVATION_PENDING = False
    LAST_DRS_ACTIVE = False

    if reset_assists:
        CURRENT_TRACTION_CONTROL = None
        CURRENT_ANTI_LOCK_BRAKES = None
        CURRENT_GEARBOX_ASSIST = None
        CURRENT_DRS_ASSIST = None
        CURRENT_STEERING_ASSIST = None
        CURRENT_BRAKING_ASSIST = None
        CURRENT_PIT_ASSIST = None
        CURRENT_PIT_RELEASE_ASSIST = None
        CURRENT_ERS_ASSIST = None
        CURRENT_DYNAMIC_RACING_LINE = None
        CUSTOM_SETUP = None
        EQUAL_PERFORMANCE = None

    CURRENT_GAME_SESSION_UID = None
    LAST_SESSION_META_SYNCED = {
        "trackId": None,
        "trackName": None,
        "sessionType": None,
    }


def get_game_session_uid(header):
    raw = get_attr_loose(
        header,
        "session_uid",
        "sessionUID",
        "sessionUid",
        "m_sessionUID",
        "m_sessionUid",
        "m_session_uid",
        default=None,
    )
    if raw is None:
        return None
    try:
        return str(int(raw))
    except Exception:
        return str(raw)


def is_game_session_packet(session_type, track_id):
    if session_type is None or session_type <= 0:
        return False
    if track_id is None:
        return False
    try:
        return int(track_id) >= 0
    except Exception:
        return False


def is_recently_closed_session_packet(game_session_uid, session_type, track_id):
    if game_session_uid and LAST_CLOSED_GAME_SESSION_UID:
        return game_session_uid == LAST_CLOSED_GAME_SESSION_UID

    if game_session_uid:
        return False

    if LAST_CLOSED_SESSION_SIGNATURE != (track_id, session_type):
        return False

    if LAST_CLOSED_SESSION_MONO is None:
        return False

    return (time.time() - LAST_CLOSED_SESSION_MONO) < max(10.0, SESSION_END_GRACE_PERIOD_SEC + 2.0)


def start_backend_session(game_session_uid=None):
    """Create a new session document on the backend.
    
    Called when the listener detects an active game session (valid session type
    and track ID). The backend returns a session ID which is used to tag all
    subsequent telemetry samples, lap records, and corner events.
    """
    global SESSION_ID, CURRENT_GAME_SESSION_UID, LAST_SESSION_META_SYNCED
    global LAST_CLOSED_GAME_SESSION_UID, LAST_CLOSED_SESSION_SIGNATURE, LAST_CLOSED_SESSION_MONO

    if SESSION_ID:
        return SESSION_ID

    user_id = ensure_user()
    if not user_id:
        return None

    reset_runtime_state_for_session(reset_assists=False)
    reset_session_end_state()
    CURRENT_GAME_SESSION_UID = game_session_uid
    LAST_CLOSED_GAME_SESSION_UID = None
    LAST_CLOSED_SESSION_SIGNATURE = None
    LAST_CLOSED_SESSION_MONO = None

    while not STOP_EVENT.is_set():
        try:
            session_payload = {
                "userId": USER_ID,
                "trackName": TRACK_NAME,
                "trackId": TRACK_ID,
                "sessionType": SESSION_TYPE,
                "customSetup": CUSTOM_SETUP,
                "equalPerformance": EQUAL_PERFORMANCE,
            }
            session_res = http.post(
                f"{API_BASE}/sessions",
                headers=listener_auth_headers(),
                json=session_payload,
                timeout=REQUEST_TIMEOUT,
            )
            session_res.raise_for_status()
            SESSION_ID = session_res.json()["id"]
            LAST_SESSION_META_SYNCED = {
                "trackId": TRACK_ID,
                "trackName": TRACK_NAME,
                "sessionType": SESSION_TYPE,
                "customSetup": CUSTOM_SETUP,
                "equalPerformance": EQUAL_PERFORMANCE,
            }
            print("Game session started. SESSION ID:", SESSION_ID, "| Track:", TRACK_NAME or TRACK_ID)
            return SESSION_ID
        except Exception as e:
            print(f"Could not create game session yet, retrying in 5s... ({e})")
            time.sleep(5)

    return None


def create_user_and_session():
    ensure_user()
    return start_backend_session()

def mark_session_end(reason, packet_type=None, detected_at=None):
    global SESSION_END_DETECTED_AT, SESSION_END_DETECTED_MONO
    global SESSION_END_REASON, SESSION_END_PACKET_TYPE

    if SESSION_END_DETECTED_AT is not None:
        return False

    SESSION_END_DETECTED_AT = detected_at or iso_now()
    SESSION_END_DETECTED_MONO = time.time()
    SESSION_END_REASON = reason
    SESSION_END_PACKET_TYPE = packet_type
    print(f"Telemetry session ended. Detected at {SESSION_END_DETECTED_AT} ({reason})")
    return True


def end_session_once(session_closed):
    if session_closed or not SESSION_ID:
        return True, False

    ended_at = SESSION_END_DETECTED_AT or LAST_SAMPLE_TIMESTAMP or iso_now()
    if SESSION_END_DETECTED_AT:
        end_source = "game_packet"
    elif LAST_SAMPLE_TIMESTAMP:
        end_source = "last_telemetry_sample"
    else:
        end_source = "listener_shutdown"
    end_reason = SESSION_END_REASON or (
        "manual_or_listener_shutdown" if not SESSION_END_DETECTED_AT else None
    )

    has_laps = len(SENT_LAP_HISTORY_SET) > 0
    skip_ai_report = not has_laps

    if skip_ai_report:
        print("No laps recorded this session. Skipping AI report generation.")

    try:
        res = http.post(
            f"{API_BASE}/sessions/{SESSION_ID}/end",
            headers=listener_auth_headers(),
            json={
                "endedAt": ended_at,
                "endedAtSource": end_source,
                "endReason": end_reason,
                "endPacketType": SESSION_END_PACKET_TYPE,
                "listenerClosedAt": iso_now(),
                "skipAiReport": skip_ai_report,
            },
            timeout=(5.0, 60.0),
        )
        res.raise_for_status()

        try:
            payload = res.json()
        except Exception:
            payload = {}

        report = payload.get("postSessionReport") or {}
        status = report.get("status")

        if status == "ready":
            print("Post-session AI report saved in Firebase.")
            print("Report path:", report.get("reportPath"))
            print("Samples:", report.get("sampleCount"), "| Laps:", report.get("lapCount"), "| Coach signals:", report.get("coachSignalCount"))
        elif status == "empty":
            print("Session ended. No post-session report data was available yet.")
        elif status == "failed":
            print("Session ended, but post-session report failed:", report.get("error"))
        else:
            print("Session ended.")
        print("Ended at:", ended_at, "| Source:", end_source)
    except Exception as e:
        print("Session end API error:", e)
        return False, has_laps
    return True, has_laps


def wait_for_queue_empty(qobj, label, timeout_sec=8.0):
    deadline = time.time() + timeout_sec
    while getattr(qobj, "unfinished_tasks", 0) > 0 and time.time() < deadline:
        time.sleep(0.05)

    remaining = getattr(qobj, "unfinished_tasks", 0)
    if remaining > 0:
        print(f"Warning: {remaining} queued {label} item(s) were still pending before session end.")


def flush_pending_telemetry_batch_sync():
    if not SESSION_ID or not TELEMETRY_BATCH:
        return

    samples = list(TELEMETRY_BATCH)
    TELEMETRY_BATCH.clear()

    try:
        post_json(
            "/telemetry/batch",
            {
                "sessionId": SESSION_ID,
                "samples": samples,
            },
            timeout=(5.0, 30.0),
        )
    except Exception as e:
        print("Telemetry batch flush error, queueing for retry:", e)
        safe_enqueue(BATCH_QUEUE, (
            "/telemetry/batch",
            {
                "sessionId": SESSION_ID,
                "samples": samples,
            },
            2,
        ))


def run_local_post_session_report(session_id=None):
    """Generate the local AI report from CSV, send to OpenRouter (Claude Opus),
    and upload the AI coach response to the backend."""
    try:
        from pathlib import Path as _Path
        import subprocess
        import sys

        csv_file = _Path(CSV_PATH)
        if not csv_file.exists() or csv_file.stat().st_size <= 100:
            print("No telemetry CSV to process (empty or missing).")
            return

        print("\nGenerating post-session AI report...")
        cmd = [
            sys.executable,
            "build_post_session_ai_report.py",
            "--csv", CSV_PATH,
            "--ai",
            "--model", "anthropic/claude-opus-4.8",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.stdout:
            print(result.stdout)
        if result.returncode != 0 and result.stderr:
            print("Report generation error:", result.stderr[-500:])
            return

        # Upload the AI coach response to the backend
        ai_output_path = _Path("ai_coach_response.md")
        if not ai_output_path.exists() or ai_output_path.stat().st_size == 0:
            print("No AI coach response file found to upload.")
            return

        if not session_id:
            print("No session ID available — skipping upload of AI coach response.")
            return

        response_text = ai_output_path.read_text(encoding="utf-8")
        upload_url = f"{API_BASE}/sessions/{session_id}/reports/ai-coach-response"
        print(f"Uploading AI coach response to backend for session {session_id}...")

        try:
            upload_res = http.post(
                upload_url,
                headers=listener_auth_headers(),
                json={
                    "responseMarkdown": response_text,
                    "model": "anthropic/claude-opus-4.8",
                    "generatedAt": iso_now(),
                },
                timeout=(5.0, 30.0),
            )
            upload_res.raise_for_status()
            print("AI coach response uploaded successfully.")
        except Exception as upload_err:
            print(f"Failed to upload AI coach response: {upload_err}")

    except Exception as e:
        print(f"Post-session report auto-generation failed: {e}")


def close_current_backend_session(reason=None, packet_type=None, detected_at=None):
    """End the current session on the backend and reset local state.
    
    This is the main session teardown function. It:
    1. Flushes any pending telemetry batches
    2. Closes any active corner being tracked
    3. Waits for all queued API requests to complete
    4. Calls POST /sessions/{id}/end on the backend (which triggers AI report generation)
    5. Resets all runtime state for the next session
    
    The backend generates the post-session AI report asynchronously after this call.
    """
    global SESSION_ID, LAST_CLOSED_GAME_SESSION_UID, LAST_CLOSED_SESSION_SIGNATURE, LAST_CLOSED_SESSION_MONO

    if not SESSION_ID:
        reset_session_end_state()
        reset_runtime_state_for_session()
        return True

    closed_game_session_uid = CURRENT_GAME_SESSION_UID
    closed_session_signature = (TRACK_ID, SESSION_TYPE)

    if reason and SESSION_END_DETECTED_AT is None:
        mark_session_end(reason, packet_type, detected_at=detected_at)

    flush_pending_telemetry_batch_sync()
    flush_active_corner(end_reason=SESSION_END_REASON or reason or "session_end")

    wait_for_queue_empty(BATCH_QUEUE, "telemetry batch")
    wait_for_queue_empty(LAP_QUEUE, "lap")
    wait_for_queue_empty(CORNER_QUEUE, "corner")

    closed, has_laps = end_session_once(False)
    if closed:
        closed_session_id = SESSION_ID  # capture before reset
        SESSION_ID = None
        reset_session_end_state()
        reset_runtime_state_for_session()
        LAST_CLOSED_GAME_SESSION_UID = closed_game_session_uid
        LAST_CLOSED_SESSION_SIGNATURE = closed_session_signature
        LAST_CLOSED_SESSION_MONO = time.time()

        # The backend/Render generates the AI coach response after the session end report is saved.
        if has_laps:
            print(f"AI coach response generation queued on backend for session {closed_session_id}.")
        else:
            print(f"Session {closed_session_id} closed without laps. No AI report queued.")

        print("Listener is still active. Waiting for the next game session...")

    return closed

def get_lap_array(pkt):
    return get_attr(pkt, "lap_data", "m_lapData")

def handle_session_packet(header, pid, data, pkt_cls, race_active, race_started_at):
    global TRACK_ID, TRACK_NAME, SESSION_TYPE, CURRENT_GAME_SESSION_UID
    global LAST_SESSION_PACKET_SIGNATURE, LAST_SESSION_PACKET_NOTICE_AT

    if pid != SESSION_PACKET_ID or pkt_cls is None:
        return race_active, race_started_at

    sess_pkt = pkt_cls.from_buffer_copy(data)
    update_assists_from_session_packet(sess_pkt)
    update_session_settings_from_packet(sess_pkt)

    session_type = int(get_attr(sess_pkt, "session_type", "mSessionType", "m_sessionType", default=0) or 0)

    track_id, track_name = extract_track_info_from_session_packet(sess_pkt)
    game_session_uid = get_game_session_uid(header)
    is_active_game_session = is_game_session_packet(session_type, track_id)
    session_signature = (session_type, track_id, track_name, is_active_game_session)
    now = time.time()

    if (
        session_signature != LAST_SESSION_PACKET_SIGNATURE
        or now - LAST_SESSION_PACKET_NOTICE_AT >= PACKET_STATUS_EVERY_SEC
    ):
        status = "active" if is_active_game_session else "ignored"
        print(
            "Session packet decoded:"
            f" type={session_type}, track={track_name or track_id}, status={status}"
        )
        LAST_SESSION_PACKET_SIGNATURE = session_signature
        LAST_SESSION_PACKET_NOTICE_AT = now

    if (
        SESSION_ID
        and CURRENT_GAME_SESSION_UID
        and game_session_uid
        and game_session_uid != CURRENT_GAME_SESSION_UID
    ):
        mark_session_end("new_game_session_detected", "session_packet")
        if close_current_backend_session():
            race_active = False
            race_started_at = None

    SESSION_TYPE = session_type
    TRACK_ID = track_id
    TRACK_NAME = track_name

    if is_active_game_session:
        if SESSION_ID and SESSION_END_DETECTED_AT is not None:
            return race_active, race_started_at

        if not SESSION_ID:
            if is_recently_closed_session_packet(game_session_uid, session_type, track_id):
                return False, None
            start_backend_session(game_session_uid)
        elif game_session_uid and CURRENT_GAME_SESSION_UID is None:
            CURRENT_GAME_SESSION_UID = game_session_uid

        sync_session_metadata()

        if not race_active:
            print("Game session detected.")
            return True, time.time()
        return True, race_started_at or time.time()

    if SESSION_ID and race_active:
        mark_session_end("left_game_session", "session_packet")
        return False, None

    return race_active, race_started_at

def handle_event_packet(pid, data, pkt_cls, race_active, race_started_at):
    if pid != EVENT_PACKET_ID or pkt_cls is None:
        return race_active, race_started_at

    event_pkt = pkt_cls.from_buffer_copy(data)
    code = extract_event_code(event_pkt)

    if code == "SEND" and race_active:
        if race_started_at is not None and (time.time() - race_started_at) < MIN_EVENT_END_AFTER_START_SEC:
            return race_active, race_started_at
        mark_session_end("session_end_event", "event_SEND")
        return False, None

    return race_active, race_started_at

def handle_final_class_packet(pid, race_active, race_started_at):
    if pid == FINAL_CLASS_PACKET_ID and race_active:
        mark_session_end("final_classification_packet", "final_classification")
        return False, None
    return race_active, race_started_at

def update_lap_state_from_packet(header, pkt):
    global CURRENT_LAP_NUM, BEST_LAP_TIME_MS, LAST_DELTA_TO_PB_MS
    global CURRENT_LAP_DISTANCE_M, CURRENT_TOTAL_DISTANCE_M, CURRENT_SECTOR, CURRENT_PIT_STATUS

    def is_plausible_lap_time_ms(ms):
        return ms is not None and 10000 <= ms <= 600000  # 10s to 10min

    arr = get_lap_array(pkt)
    if arr is None or len(arr) == 0:
        return

    player_idx = get_player_car_index(header)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    lap = arr[player_idx]

    current_lap = parse_int(get_attr(lap, "current_lap_num", "mCurrentLapNum", "m_currentLapNum", default=None), None)
    last_lap_time = parse_int(get_attr(lap, "last_lap_time_in_ms", "mLastLapTimeInMS", "m_lastLapTimeInMS", default=None), None)

    lap_distance = parse_number(get_attr(lap, "lap_distance", "mLapDistance", "m_lapDistance", default=None), None)
    total_distance = parse_number(get_attr(lap, "total_distance", "mTotalDistance", "m_totalDistance", default=None), None)
    CURRENT_LAP_DISTANCE_M = lap_distance
    CURRENT_TOTAL_DISTANCE_M = total_distance

    current_sector = parse_int(get_attr(lap, "sector", "m_sector", default=None), None)
    if current_sector is not None:
        CURRENT_SECTOR = current_sector

    pit_status = parse_int(
        get_attr(lap, "pit_status", "mPitStatus", "m_pitStatus", default=None),
        None,
    )
    if pit_status is not None:
        CURRENT_PIT_STATUS = pit_status

    if current_lap is not None:
        if CURRENT_LAP_NUM is not None and current_lap > CURRENT_LAP_NUM:
            print(f"\n---> LAP {CURRENT_LAP_NUM} COMPLETED! Time: {last_lap_time} ms <---\n")

            if SESSION_ID and is_plausible_lap_time_ms(last_lap_time) and CURRENT_LAP_NUM not in SENT_LAP_HISTORY_SET:
                safe_enqueue(LAP_QUEUE, (
                    f"/sessions/{SESSION_ID}/laps",
                    {
                        "lapNumber": CURRENT_LAP_NUM,
                        "lapTimeMs": last_lap_time,
                        "sector1Ms": None,
                        "sector2Ms": None,
                        "sector3Ms": None,
                        "trackName": TRACK_NAME,
                        "trackId": TRACK_ID,
                        "assists": build_assist_profile(),
                    },
                    3,
                ))
            elif not is_plausible_lap_time_ms(last_lap_time):
                print(f"Ignoring implausible lap time: {last_lap_time} ms")

        CURRENT_LAP_NUM = current_lap

    current_lap_time_ms = parse_int(get_attr(lap, "current_lap_time_in_ms", "mCurrentLapTimeInMS", "m_currentLapTimeInMS", default=None), None)
    best_lap_time_ms = parse_int(get_attr(lap, "best_lap_time_in_ms", "mBestLapTimeInMS", "m_bestLapTimeInMS", default=None), None)

    if best_lap_time_ms is not None and is_plausible_lap_time_ms(best_lap_time_ms):
        if BEST_LAP_TIME_MS is None or best_lap_time_ms < BEST_LAP_TIME_MS:
            BEST_LAP_TIME_MS = best_lap_time_ms
    elif current_lap_time_ms is not None and is_plausible_lap_time_ms(current_lap_time_ms) and BEST_LAP_TIME_MS is None:
        BEST_LAP_TIME_MS = current_lap_time_ms

    if current_lap_time_ms is not None and BEST_LAP_TIME_MS is not None:
        LAST_DELTA_TO_PB_MS = current_lap_time_ms - BEST_LAP_TIME_MS
    else:
        LAST_DELTA_TO_PB_MS = None

LAST_HISTORY_NUM_LAPS = 0
SENT_LAP_HISTORY_SET = set()

def compute_sector_time_ms(ms_part, minutes_part):
    """Convert the split sector time fields into a single millisecond value."""
    ms_part = parse_int(ms_part, 0) or 0
    minutes_part = parse_int(minutes_part, 0) or 0
    total_ms = (minutes_part * 60000) + ms_part
    return total_ms if total_ms > 0 else None

def handle_session_history_packet(header, pkt):
    """Extract per-lap sector times from PacketSessionHistoryData and send to API."""
    global LAST_HISTORY_NUM_LAPS

    if not SESSION_ID or pkt is None:
        return

    car_idx = parse_int(get_attr(pkt, "car_idx", "m_carIdx", default=None), None)
    player_idx = get_player_car_index(header)

    # Only process the player's own history packet
    if car_idx is not None and car_idx != player_idx:
        return

    num_laps = parse_int(get_attr(pkt, "num_laps", "m_numLaps", default=0), 0) or 0
    if num_laps == 0:
        return

    lap_history = get_attr(pkt, "lap_history_data", "m_lapHistoryData")
    if lap_history is None or len(lap_history) == 0:
        return

    # Only process newly completed laps
    for lap_idx in range(min(num_laps, len(lap_history))):
        lap_num = lap_idx + 1

        if lap_num in SENT_LAP_HISTORY_SET:
            continue

        entry = lap_history[lap_idx]

        lap_time_ms = parse_int(get_attr(entry, "lap_time_in_ms", "m_lapTimeInMS", default=0), 0) or 0
        if lap_time_ms <= 0:
            continue  # Lap not yet completed

        s1_ms = compute_sector_time_ms(
            get_attr(entry, "sector1_time_ms_part", "m_sector1TimeMSPart", default=0),
            get_attr(entry, "sector1_time_minutes_part", "m_sector1TimeMinutesPart", default=0),
        )
        s2_ms = compute_sector_time_ms(
            get_attr(entry, "sector2_time_ms_part", "m_sector2TimeMSPart", default=0),
            get_attr(entry, "sector2_time_minutes_part", "m_sector2TimeMinutesPart", default=0),
        )
        s3_ms = compute_sector_time_ms(
            get_attr(entry, "sector3_time_ms_part", "m_sector3TimeMSPart", default=0),
            get_attr(entry, "sector3_time_minutes_part", "m_sector3TimeMinutesPart", default=0),
        )

        # Validate: plausible lap time (10s to 10min)
        if not (10000 <= lap_time_ms <= 600000):
            continue

        lap_valid_flags = parse_int(get_attr(entry, "lap_valid_bit_flags", "m_lapValidBitFlags", default=0), 0)

        payload = {
            "lapNumber": lap_num,
            "lapTimeMs": lap_time_ms,
            "sector1Ms": s1_ms,
            "sector2Ms": s2_ms,
            "sector3Ms": s3_ms,
            "valid": bool(lap_valid_flags & 0x01) if lap_valid_flags is not None else True,
            "trackName": TRACK_NAME,
            "trackId": TRACK_ID,
            "assists": build_assist_profile(),
        }

        safe_enqueue(LAP_QUEUE, (
            f"/sessions/{SESSION_ID}/laps",
            payload,
            3,
        ))

        SENT_LAP_HISTORY_SET.add(lap_num)
        print(f"  Lap {lap_num}: {lap_time_ms}ms | S1: {s1_ms}ms | S2: {s2_ms}ms | S3: {s3_ms}ms")

    LAST_HISTORY_NUM_LAPS = num_laps

def enqueue_latest(item):
    # Live updates should never build a backlog. If the API/network pauses, keep only
    # the newest sample so the website does not replay stale telemetry to catch up.
    while True:
        try:
            LATEST_QUEUE.get_nowait()
        except queue.Empty:
            break

    try:
        LATEST_QUEUE.put_nowait(item)
    except queue.Full:
        try:
            LATEST_QUEUE.get_nowait()
        except queue.Empty:
            pass
        try:
            LATEST_QUEUE.put_nowait(item)
        except queue.Full:
            pass

def post_latest_telemetry(sample_body):
    if not SESSION_ID:
        return

    enqueue_latest((
        "/telemetry/latest",
        {
            "sessionId": SESSION_ID,
            "latestTelemetry": sample_body,
        },
        0,
    ))

def parse_assist_int(value):
    return parse_int(value, None)

def assist_bool(value):
    parsed = parse_int(value, None)
    if parsed is None:
        return None
    return parsed != 0

def session_bool(value):
    return assist_bool(value)

def traction_control_label(value):
    if value is None:
        return "Unknown"
    return {
        0: "Off",
        1: "Medium",
        2: "Full",
    }.get(value, f"Level {value}")

def gearbox_assist_label(value):
    if value is None:
        return "Unknown"
    return {
        0: "Manual",
        1: "Manual",
        2: "Suggested",
        3: "Automatic",
    }.get(value, f"Mode {value}")

def build_assist_profile():
    """Build a dictionary of the current driving assist settings.
    
    This profile is attached to every telemetry sample and lap record sent
    to the backend, allowing the AI coach to understand which assists the
    driver is using and tailor advice accordingly (e.g., "try disabling ABS").
    """
    automatic_gearbox = None
    suggested_gear = None
    if CURRENT_GEARBOX_ASSIST is not None:
        automatic_gearbox = CURRENT_GEARBOX_ASSIST >= 3
        suggested_gear = CURRENT_GEARBOX_ASSIST == 2

    return {
        "tractionControl": CURRENT_TRACTION_CONTROL,
        "tractionControlLabel": traction_control_label(CURRENT_TRACTION_CONTROL),
        "tractionControlActive": CURRENT_TRACTION_CONTROL is not None and CURRENT_TRACTION_CONTROL > 0,
        "antiLockBrakes": CURRENT_ANTI_LOCK_BRAKES,
        "antiLockBrakesActive": CURRENT_ANTI_LOCK_BRAKES is True,
        "gearboxAssist": CURRENT_GEARBOX_ASSIST,
        "gearboxAssistLabel": gearbox_assist_label(CURRENT_GEARBOX_ASSIST),
        "automaticGearbox": automatic_gearbox,
        "suggestedGear": suggested_gear,
        "drsAssist": CURRENT_DRS_ASSIST,
        "drsAssistActive": CURRENT_DRS_ASSIST is True,
        "steeringAssist": CURRENT_STEERING_ASSIST,
        "steeringAssistActive": CURRENT_STEERING_ASSIST is True,
        "brakingAssist": CURRENT_BRAKING_ASSIST,
        "brakingAssistActive": CURRENT_BRAKING_ASSIST is True,
        "pitAssist": CURRENT_PIT_ASSIST,
        "pitAssistActive": CURRENT_PIT_ASSIST is True,
        "pitReleaseAssist": CURRENT_PIT_RELEASE_ASSIST,
        "pitReleaseAssistActive": CURRENT_PIT_RELEASE_ASSIST is True,
        "ersAssist": CURRENT_ERS_ASSIST,
        "ersAssistActive": CURRENT_ERS_ASSIST is True,
        "dynamicRacingLine": CURRENT_DYNAMIC_RACING_LINE,
        "dynamicRacingLineActive": CURRENT_DYNAMIC_RACING_LINE is not None and CURRENT_DYNAMIC_RACING_LINE > 0,
    }

def update_assists_from_session_packet(sess_pkt):
    global CURRENT_TRACTION_CONTROL, CURRENT_ANTI_LOCK_BRAKES, CURRENT_GEARBOX_ASSIST
    global CURRENT_DRS_ASSIST, CURRENT_STEERING_ASSIST, CURRENT_BRAKING_ASSIST
    global CURRENT_PIT_ASSIST, CURRENT_PIT_RELEASE_ASSIST, CURRENT_ERS_ASSIST
    global CURRENT_DYNAMIC_RACING_LINE

    traction = parse_assist_int(get_attr_loose(
        sess_pkt,
        "traction_control",
        "tractionControl",
        "m_tractionControl",
        "m_traction_control",
        default=None,
    ))
    anti_lock = assist_bool(get_attr_loose(
        sess_pkt,
        "anti_lock_brakes",
        "antiLockBrakes",
        "m_antiLockBrakes",
        "m_anti_lock_brakes",
        default=None,
    ))
    gearbox = parse_assist_int(get_attr_loose(
        sess_pkt,
        "gearbox_assist",
        "gearboxAssist",
        "m_gearboxAssist",
        "m_gearbox_assist",
        default=None,
    ))
    drs_assist = assist_bool(get_attr_loose(
        sess_pkt,
        "drs_assist",
        "drsAssist",
        "DRSAssist",
        "m_drsAssist",
        "m_DRSAssist",
        "m_drs_assist",
        default=None,
    ))
    steering_assist = assist_bool(get_attr_loose(
        sess_pkt,
        "steering_assist",
        "steeringAssist",
        "m_steeringAssist",
        "m_steering_assist",
        default=None,
    ))
    braking_assist = assist_bool(get_attr_loose(
        sess_pkt,
        "braking_assist",
        "brakingAssist",
        "m_brakingAssist",
        "m_braking_assist",
        default=None,
    ))
    pit_assist = assist_bool(get_attr_loose(
        sess_pkt,
        "pit_assist",
        "pitAssist",
        "m_pitAssist",
        "m_pit_assist",
        default=None,
    ))
    pit_release_assist = assist_bool(get_attr_loose(
        sess_pkt,
        "pit_release_assist",
        "pitReleaseAssist",
        "m_pitReleaseAssist",
        "m_pit_release_assist",
        default=None,
    ))
    ers_assist = assist_bool(get_attr_loose(
        sess_pkt,
        "ers_assist",
        "ersAssist",
        "ERSAssist",
        "m_ersAssist",
        "m_ERSAssist",
        "m_ers_assist",
        default=None,
    ))
    racing_line = parse_assist_int(get_attr_loose(
        sess_pkt,
        "dynamic_racing_line",
        "dynamicRacingLine",
        "m_dynamicRacingLine",
        "m_dynamic_racing_line",
        default=None,
    ))

    if traction is not None:
        CURRENT_TRACTION_CONTROL = traction
    if anti_lock is not None:
        CURRENT_ANTI_LOCK_BRAKES = anti_lock
    if gearbox is not None:
        CURRENT_GEARBOX_ASSIST = gearbox
    if drs_assist is not None:
        CURRENT_DRS_ASSIST = drs_assist
    if steering_assist is not None:
        CURRENT_STEERING_ASSIST = steering_assist
    if braking_assist is not None:
        CURRENT_BRAKING_ASSIST = braking_assist
    if pit_assist is not None:
        CURRENT_PIT_ASSIST = pit_assist
    if pit_release_assist is not None:
        CURRENT_PIT_RELEASE_ASSIST = pit_release_assist
    if ers_assist is not None:
        CURRENT_ERS_ASSIST = ers_assist
    if racing_line is not None:
        CURRENT_DYNAMIC_RACING_LINE = racing_line

def update_session_settings_from_packet(sess_pkt):
    global CUSTOM_SETUP, EQUAL_PERFORMANCE

    custom_setup = session_bool(get_attr_loose(
        sess_pkt,
        "custom_setup",
        "customSetup",
        "customSetups",
        "is_custom_setup",
        "isCustomSetup",
        "using_custom_setup",
        "usingCustomSetup",
        "m_customSetup",
        "m_custom_setup",
        "m_customSetups",
        "m_isCustomSetup",
        "m_usingCustomSetup",
        "m_using_custom_setup",
        default=None,
    ))
    equal_performance = session_bool(get_attr_loose(
        sess_pkt,
        "equal_performance",
        "equalPerformance",
        "equal_car_performance",
        "equalCarPerformance",
        "m_equalPerformance",
        "m_equal_performance",
        "m_equalCarPerformance",
        "m_equal_car_performance",
        default=None,
    ))

    if custom_setup is not None:
        CUSTOM_SETUP = custom_setup
    if equal_performance is not None:
        EQUAL_PERFORMANCE = equal_performance

def update_assists_from_car_status(status):
    global CURRENT_TRACTION_CONTROL, CURRENT_ANTI_LOCK_BRAKES

    traction = parse_assist_int(get_attr_loose(
        status,
        "traction_control",
        "tractionControl",
        "m_tractionControl",
        "m_traction_control",
        default=None,
    ))
    anti_lock = assist_bool(get_attr_loose(
        status,
        "anti_lock_brakes",
        "antiLockBrakes",
        "m_antiLockBrakes",
        "m_anti_lock_brakes",
        default=None,
    ))

    if traction is not None:
        CURRENT_TRACTION_CONTROL = traction
    if anti_lock is not None:
        CURRENT_ANTI_LOCK_BRAKES = anti_lock

def update_drs_status_from_packet(header, pkt):
    global CURRENT_DRS_AVAILABLE, CURRENT_DRS_ACTIVATION_DISTANCE_M
    global DRS_AVAILABLE_SINCE_MONO, DRS_AVAILABLE_SINCE_LAP_DISTANCE_M, DRS_ACTIVATION_PENDING

    arr = get_attr_loose(pkt, "car_status_data", "carStatusData", "m_carStatusData", "m_car_status_data", default=None)
    if arr is None or len(arr) == 0:
        return

    player_idx = get_player_car_index(header)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    status = arr[player_idx]
    update_assists_from_car_status(status)

    allowed_raw = get_attr_loose(
        status,
        "drs_allowed",
        "drsAllowed",
        "m_drsAllowed",
        "m_drs_allowed",
        "m_DRSAllowed",
        default=None,
    )
    activation_distance = parse_number(get_attr_loose(
        status,
        "drs_activation_distance",
        "drsActivationDistance",
        "m_drsActivationDistance",
        "m_drs_activation_distance",
        default=None,
    ), None)

    available = bool(int(parse_int(allowed_raw, 0) or 0))
    now = time.time()

    if available and not CURRENT_DRS_AVAILABLE:
        DRS_AVAILABLE_SINCE_MONO = now
        DRS_AVAILABLE_SINCE_LAP_DISTANCE_M = CURRENT_LAP_DISTANCE_M
        DRS_ACTIVATION_PENDING = True
    elif not available:
        DRS_AVAILABLE_SINCE_MONO = None
        DRS_AVAILABLE_SINCE_LAP_DISTANCE_M = None
        DRS_ACTIVATION_PENDING = False

    CURRENT_DRS_AVAILABLE = available
    CURRENT_DRS_ACTIVATION_DISTANCE_M = activation_distance
def post_telemetry_sample(header, pkt):
    """Process a telemetry packet and send the sample to the backend.
    
    This is the core telemetry processing function, called for every
    Telemetry packet (packet ID 6) received from the game. It:
    
    1. Extracts speed, throttle, brake, steering, RPM, gear, DRS from the packet
    2. Calculates derived metrics (cornering speed, braking distance, DRS reaction delay)
    3. Attaches world position (from Motion packets) and lap data (from Lap packets)
    4. Updates the local live sample (for the SSE stream to the website)
    5. Updates corner detection state
    6. Rate-limits backend sends to one sample per SAMPLE_MIN_INTERVAL_SEC
    7. Batches samples and flushes when BATCH_SIZE is reached
    """
    global LAST_SAMPLE_SENT_AT, LAST_SAMPLE_TIMESTAMP
    global BRAKE_ACTIVE, BRAKE_START_DISTANCE_M, LAST_BRAKE_SAMPLE_TIME, TELEMETRY_BATCH
    global CURRENT_WORLD_X, CURRENT_WORLD_Y, CURRENT_WORLD_Z, CURRENT_YAW, CURRENT_PITCH, CURRENT_ROLL
    global DRS_ACTIVATION_PENDING, LAST_DRS_ACTIVE

    if not SESSION_ID or pkt is None:
        return

    now = time.time()
    should_send_backend_sample = now - LAST_SAMPLE_SENT_AT >= SAMPLE_MIN_INTERVAL_SEC

    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData", "m_carTelemetryData")
    if arr is None or len(arr) == 0:
        return

    player_idx = get_player_car_index(header)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    t = arr[player_idx]

    speed = int(parse_int(get_attr(t, "speed", "m_speed", default=0), 0) or 0)
    throttle = float(parse_number(get_attr(t, "throttle", "m_throttle", default=0.0), 0.0) or 0.0)
    brake = float(parse_number(get_attr(t, "brake", "m_brake", default=0.0), 0.0) or 0.0)
    steering = float(parse_number(get_attr(t, "steer", "m_steer", default=0.0), 0.0) or 0.0)
    rpm = int(parse_int(get_attr_loose(
        t,
        "rpm",
        "engineRPM",
        "engineRpm",
        "engine_rpm",
        "m_engineRPM",
        "m_engineRpm",
        "m_engine_rpm",
        default=0,
    ), 0) or 0)
    gear = int(parse_int(get_attr(t, "gear", "m_gear", default=0), 0) or 0)
    drs = bool(int(parse_int(get_attr(t, "drs", "m_drs", default=0), 0) or 0))
    raw_drs_activation_distance = parse_number(
        get_attr_loose(
            t,
            "drs_activation_distance",
            "drsActivationDistance",
            "m_drsActivationDistance",
            "m_drs_activation_distance",
            default=None,
        ),
        None,
    )
    drs_activation_distance = (
        raw_drs_activation_distance
        if raw_drs_activation_distance is not None
        else CURRENT_DRS_ACTIVATION_DISTANCE_M
    )
    drs_activation_delay_ms = None
    drs_activation_delay_distance_m = None
    if CURRENT_DRS_AVAILABLE and drs and not LAST_DRS_ACTIVE and DRS_ACTIVATION_PENDING:
        if DRS_AVAILABLE_SINCE_MONO is not None:
            drs_activation_delay_ms = int(max(0, (now - DRS_AVAILABLE_SINCE_MONO) * 1000))
        if DRS_AVAILABLE_SINCE_LAP_DISTANCE_M is not None and CURRENT_LAP_DISTANCE_M is not None:
            drs_activation_delay_distance_m = max(
                0.0,
                float(CURRENT_LAP_DISTANCE_M) - float(DRS_AVAILABLE_SINCE_LAP_DISTANCE_M),
            )
        DRS_ACTIVATION_PENDING = False
    LAST_DRS_ACTIVE = drs

    cornering_speed = speed if abs(steering) >= 0.25 else None

    braking_distance = None
    if LAST_BRAKE_SAMPLE_TIME is not None:
        dt = now - LAST_BRAKE_SAMPLE_TIME
        speed_mps = speed / 3.6

        if brake > 0.05:
            if not BRAKE_ACTIVE:
                BRAKE_ACTIVE = True
                BRAKE_START_DISTANCE_M = 0.0
            BRAKE_START_DISTANCE_M += speed_mps * dt
            braking_distance = BRAKE_START_DISTANCE_M
        else:
            BRAKE_ACTIVE = False
            BRAKE_START_DISTANCE_M = 0.0
            braking_distance = None

    LAST_BRAKE_SAMPLE_TIME = now

    sample_timestamp = iso_now()
    LAST_SAMPLE_TIMESTAMP = sample_timestamp
    warn_if_telemetry_has_no_map_position()

    sample_body = {
        "timestamp": sample_timestamp,
        "sampleIndex": get_frame_identifier(header, pkt),
        "gameTimeMs": get_attr(header, "session_time", "mSessionTime", "m_sessionTime", default=None),
        "lapNumber": CURRENT_LAP_NUM,
        "lapDistance": CURRENT_LAP_DISTANCE_M,
        "totalDistance": CURRENT_TOTAL_DISTANCE_M,
        "worldX": CURRENT_WORLD_X,
        "worldY": CURRENT_WORLD_Y,
        "worldZ": CURRENT_WORLD_Z,
        "yaw": CURRENT_YAW,
        "pitch": CURRENT_PITCH,
        "roll": CURRENT_ROLL,
        "speedKph": speed,
        "throttle": throttle,
        "brake": brake,
        "steering": steering,
        "rpm": rpm,
        "gear": gear,
        "deltaToPB": LAST_DELTA_TO_PB_MS,
        "corneringSpeed": cornering_speed,
        "brakingDistance": braking_distance,
        "drs": drs,
        "drsAvailable": CURRENT_DRS_AVAILABLE,
        "drsActivationDistanceM": drs_activation_distance,
        "drsActivationDistance": drs_activation_distance,
        "drsActivationDelayMs": drs_activation_delay_ms,
        "drsActivationDelayDistanceM": drs_activation_delay_distance_m,
        "assists": build_assist_profile(),
        "playerCarIndex": player_idx,
        "currentSector": CURRENT_SECTOR,
        "pitStatus": CURRENT_PIT_STATUS,
    }

    update_local_live_sample(sample_body)
    update_corner_state_from_sample(sample_body)

    if not should_send_backend_sample:
        return

    LAST_SAMPLE_SENT_AT = now
    post_latest_telemetry(sample_body)

    TELEMETRY_BATCH.append(sample_body)
    if len(TELEMETRY_BATCH) >= BATCH_SIZE:
        safe_enqueue(BATCH_QUEUE, (
            "/telemetry/batch",
            {
                "sessionId": SESSION_ID,
                "samples": list(TELEMETRY_BATCH),
            },
            2,
        ))
        TELEMETRY_BATCH.clear()

def main():
    """Main entry point for the telemetry listener.
    
    Startup sequence:
    1. Start the local HTTP pairing server (for website ↔ listener communication)
    2. Prompt/load driver identity (username, email, listener token)
    3. Open UDP socket on port 20777 (F1 25 telemetry port)
    4. Sniff the player's in-game name from Participants packets
    5. Start background worker threads for API communication
    6. Ensure the user account exists on the backend
    7. Enter the main packet processing loop
    
    Main loop:
    - Receives UDP packets from F1 25
    - Decodes the packet header to determine type
    - Routes to appropriate handler (session, telemetry, lap, motion, etc.)
    - Detects session start/end and manages the backend session lifecycle
    - Writes raw telemetry to CSV as a local backup
    
    Shutdown:
    - On CTRL+C: flushes remaining data, closes the session, stops threads
    """
    global DRIVER_USERNAME

    start_local_pairing_server()
    prompt_identity()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    sock.settimeout(SOCKET_TIMEOUT_SEC)

    detected_name = sniff_player_name(sock, timeout_sec=10.0)
    if detected_name and not is_fake_name(detected_name):
        print("Detected in-game player name:", detected_name)
    elif DRIVER_USERNAME:
        print("Using username:", DRIVER_USERNAME)
    else:
        print("No account paired yet. Listener will wait for website login before sending telemetry.")

    live_thread = threading.Thread(target=queue_worker, args=(LATEST_QUEUE, "latest"), daemon=True)
    batch_thread = threading.Thread(target=queue_worker, args=(BATCH_QUEUE, "batch"), daemon=True)
    lap_thread = threading.Thread(target=queue_worker, args=(LAP_QUEUE, "lap"), daemon=True)
    corner_thread = threading.Thread(target=queue_worker, args=(CORNER_QUEUE, "corner"), daemon=True)

    live_thread.start()
    batch_thread.start()
    lap_thread.start()
    corner_thread.start()

    ensure_user()
    print("Waiting for an active F1 game session...")

    race_active = False
    race_started_at = None
    rows_buffer = []
    packet_counts = {}
    last_packet_seen_at = None
    last_packet_status_at = time.time()
    last_unknown_packet_notice_at = 0.0
    last_telemetry_fallback_notice_at = 0.0

    try:
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow([
                "timestamp",
                "lap_number",
                "lap_distance",
                "total_distance",
                "world_x",
                "world_y",
                "world_z",
                "yaw",
                "pitch",
                "roll",
                "speed_kph",
                "throttle",
                "brake",
                "steering",
                "rpm",
                "gear",
                "delta_to_pb",
                "cornering_speed",
                "braking_distance",
                "drs",
                "drs_available",
                "drs_activation_distance_m",
                "drs_activation_delay_ms",
                "drs_activation_delay_distance_m",
            ])

            print("\nListening for telemetry... (CTRL+C to stop)")

            while not STOP_EVENT.is_set():
                try:
                    data, addr = sock.recvfrom(4096)
                except socket.timeout:
                    now = time.time()
                    if now - last_packet_status_at >= PACKET_STATUS_EVERY_SEC:
                        if last_packet_seen_at is None:
                            print(
                                f"No F1 UDP packets received yet on port {UDP_PORT}. "
                                "Check F1 25 Telemetry is On and UDP port is 20777."
                            )
                        else:
                            print(
                                "UDP packets are arriving, but no new packet landed in the last second. "
                                f"Recent counts: {format_packet_counts(packet_counts)} | "
                                f"backend session: {SESSION_ID or '-'}"
                            )
                            packet_counts.clear()
                        last_packet_status_at = now

                    if (
                        SESSION_END_DETECTED_MONO is not None
                        and time.time() - SESSION_END_DETECTED_MONO >= SESSION_END_GRACE_PERIOD_SEC
                    ):
                        print(f"End grace window complete ({SESSION_END_GRACE_PERIOD_SEC:.1f}s). Closing current game session.")
                        if close_current_backend_session():
                            race_active = False
                            race_started_at = None
                    continue

                header_size = ctypes.sizeof(PacketHeader)
                if len(data) < header_size:
                    continue

                try:
                    header = PacketHeader.from_buffer_copy(data[:header_size])
                except Exception:
                    continue

                pid = int(get_attr_loose(header, "packet_id", "packetId", "mPacketId", "m_packetId", default=0) or 0)
                packet_counts[pid] = packet_counts.get(pid, 0) + 1
                last_packet_seen_at = time.time()
                pkt_cls = pick_packet_class(header)

                pkt = None
                if pkt_cls is not None:
                    try:
                        pkt = pkt_cls.from_buffer_copy(data)
                    except Exception:
                        pkt = None
                elif time.time() - last_unknown_packet_notice_at >= PACKET_STATUS_EVERY_SEC:
                    print(
                        f"UDP packet received but parser has no class for {packet_label(pid)}. "
                        f"Header: {describe_header(header)}"
                    )
                    last_unknown_packet_notice_at = time.time()

                race_active, race_started_at = handle_session_packet(header, pid, data, pkt_cls, race_active, race_started_at)
                race_active, race_started_at = handle_event_packet(pid, data, pkt_cls, race_active, race_started_at)
                race_active, race_started_at = handle_final_class_packet(pid, race_active, race_started_at)

                if pid == MOTION_PACKET_ID and pkt is not None:
                    update_motion_state_from_packet(header, pkt)

                if pid == LAP_DATA_PACKET_ID and pkt is not None:
                    update_lap_state_from_packet(header, pkt)

                if pid == SESSION_HISTORY_PACKET_ID and pkt is not None:
                    handle_session_history_packet(header, pkt)


                if pid == CAR_STATUS_PACKET_ID and pkt is not None:
                    update_drs_status_from_packet(header, pkt)

                if pid == TELEMETRY_PACKET_ID and pkt is not None:
                    if not SESSION_ID:
                        now = time.time()
                        if now - last_telemetry_fallback_notice_at >= PACKET_STATUS_EVERY_SEC:
                            print(
                                "Telemetry packets are arriving before a backend session exists. "
                                "Starting a session from telemetry fallback..."
                            )
                            last_telemetry_fallback_notice_at = now
                        start_backend_session(get_game_session_uid(header))

                    post_telemetry_sample(header, pkt)

                    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData")
                    if arr is not None and len(arr) > 0:
                        idx = get_player_car_index(header)
                        if not (0 <= idx < len(arr)):
                            idx = 0

                        t = arr[idx]
                        speed = int(parse_int(get_attr(t, "speed", "m_speed", default=0), 0) or 0)
                        throttle = float(parse_number(get_attr(t, "throttle", "m_throttle", default=0.0), 0.0) or 0.0)
                        brake = float(parse_number(get_attr(t, "brake", "m_brake", default=0.0), 0.0) or 0.0)
                        steering = float(parse_number(get_attr(t, "steer", "m_steer", default=0.0), 0.0) or 0.0)
                        rpm = int(parse_int(get_attr_loose(
                            t,
                            "rpm",
                            "engineRPM",
                            "engineRpm",
                            "engine_rpm",
                            "m_engineRPM",
                            "m_engineRpm",
                            "m_engine_rpm",
                            default=0,
                        ), 0) or 0)
                        gear = int(parse_int(get_attr(t, "gear", "m_gear", default=0), 0) or 0)
                        drs = bool(int(parse_int(get_attr(t, "drs", "m_drs", default=0), 0) or 0))
                        raw_drs_activation_distance = parse_number(
                            get_attr_loose(
                                t,
                                "drs_activation_distance",
                                "drsActivationDistance",
                                "m_drsActivationDistance",
                                "m_drs_activation_distance",
                                default=None,
                            ),
                            None,
                        )
                        drs_activation_distance = (
                            raw_drs_activation_distance
                            if raw_drs_activation_distance is not None
                            else CURRENT_DRS_ACTIVATION_DISTANCE_M
                        )

                        rows_buffer.append([
                            iso_now(),
                            CURRENT_LAP_NUM,
                            CURRENT_LAP_DISTANCE_M,
                            CURRENT_TOTAL_DISTANCE_M,
                            CURRENT_WORLD_X,
                            CURRENT_WORLD_Y,
                            CURRENT_WORLD_Z,
                            CURRENT_YAW,
                            CURRENT_PITCH,
                            CURRENT_ROLL,
                            speed,
                            throttle,
                            brake,
                            steering,
                            rpm,
                            gear,
                            LAST_DELTA_TO_PB_MS,
                            speed if abs(steering) >= 0.25 else None,
                            BRAKE_START_DISTANCE_M if brake > 0.05 else None,
                            drs,
                            CURRENT_DRS_AVAILABLE,
                            drs_activation_distance,
                            None,
                            None,
                        ])

                        if len(rows_buffer) >= CSV_FLUSH_EVERY_ROWS:
                            w.writerows(rows_buffer)
                            f.flush()
                            rows_buffer.clear()

                if (
                    SESSION_END_DETECTED_MONO is not None
                    and time.time() - SESSION_END_DETECTED_MONO >= SESSION_END_GRACE_PERIOD_SEC
                ):
                    print(f"End grace window complete ({SESSION_END_GRACE_PERIOD_SEC:.1f}s). Closing current game session.")
                    if close_current_backend_session():
                        race_active = False
                        race_started_at = None

                now = time.time()
                if now - last_packet_status_at >= PACKET_STATUS_EVERY_SEC:
                    print(
                        f"UDP ok. Recent packets: {format_packet_counts(packet_counts)} | "
                        f"backend session: {SESSION_ID or '-'}"
                    )
                    packet_counts.clear()
                    last_packet_status_at = now

    except KeyboardInterrupt:
        print("\nStopped. Saving resources...")

    finally:
        if rows_buffer:
            try:
                with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    w.writerows(rows_buffer)
            except Exception:
                pass

        if SESSION_ID and SESSION_END_DETECTED_AT is None:
            mark_session_end("listener_stopped", "listener_shutdown", detected_at=LAST_SAMPLE_TIMESTAMP or iso_now())

        close_current_backend_session(reason="listener_stopped", packet_type="listener_shutdown")

        STOP_EVENT.set()
        try:
            live_thread.join(timeout=3)
            batch_thread.join(timeout=3)
            lap_thread.join(timeout=3)
            corner_thread.join(timeout=3)
        except Exception:
            pass

        sock.close()

        # Report generation is now handled inside close_current_backend_session()
        # which was already called above.

if __name__ == "__main__":
    main()



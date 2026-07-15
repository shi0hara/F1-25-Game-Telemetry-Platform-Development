import csv
import socket
import time
import ctypes
import queue
import threading
import os
import getpass
from datetime import datetime, timezone

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from f1.packets import PacketHeader, HEADER_FIELD_TO_PACKET_TYPE

API_BASE = "https://f1-telementry-1.onrender.com"
UDP_IP = "0.0.0.0"
UDP_PORT = 20777
CSV_PATH = "telemetry_live.csv"

PRINT_HEADERS = False
HEADER_PRINT_EVERY_SEC = 0.5

MOTION_PACKET_ID = 0
SESSION_PACKET_ID = 1
LAP_DATA_PACKET_ID = 2
EVENT_PACKET_ID = 3
TELEMETRY_PACKET_ID = 6
CAR_STATUS_PACKET_ID = 7
FINAL_CLASS_PACKET_ID = 8
SESSION_HISTORY_PACKET_ID = 11

RACE_SESSION_TYPES = {15, 16, 17}
MIN_EVENT_END_AFTER_START_SEC = 10.0
SESSION_END_GRACE_PERIOD_SEC = float(os.getenv("SESSION_END_GRACE_PERIOD_SEC", "3.0"))
SESSION_IDLE_END_TIMEOUT_SEC = float(os.getenv("SESSION_IDLE_END_TIMEOUT_SEC", "12.0"))

REQUEST_TIMEOUT = (5.0, 10.0)
LATEST_REQUEST_TIMEOUT = (1.0, 2.0)
SOCKET_TIMEOUT_SEC = 1.0
SAMPLE_MIN_INTERVAL_SEC = 0.1
CSV_FLUSH_EVERY_ROWS = 25

BATCH_SIZE = 20
TELEMETRY_BATCH = []

PARTICIPANTS_PACKET_ID = 4

DRIVER_USERNAME = os.getenv("DRIVER_USERNAME")
DRIVER_EMAIL = os.getenv("DRIVER_EMAIL")

PLAYER_NAME_DETECTED = False

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

TRACK_NAME = None
TRACK_ID = None
SESSION_TYPE = None

CURRENT_LAP_DISTANCE_M = None
CURRENT_TOTAL_DISTANCE_M = None
CURRENT_SECTOR = None
CURRENT_PIT_STATUS = None

# Latest world-space car position from Motion packet 0.
# The website uses worldX/worldZ to draw the live telemetry map trail.
CURRENT_WORLD_X = None
CURRENT_WORLD_Y = None
CURRENT_WORLD_Z = None
CURRENT_YAW = None
CURRENT_PITCH = None
CURRENT_ROLL = None
LAST_MOTION_PACKET_AT = None
LAST_VALID_MOTION_AT = None
LAST_MOTION_DEBUG_AT = 0.0
LAST_TELEMETRY_NO_MOTION_WARN_AT = 0.0

CORNER_ACTIVE = False
CORNER_START = None
CORNER_COUNTER = 0

CORNER_START_THRESHOLD = 0.25
CORNER_END_THRESHOLD = 0.15

LAST_SESSION_META_SYNCED = {
    "trackId": None,
    "trackName": None,
    "sessionType": None,
}

def get_track_name(track_id):
    if track_id is None:
        return None
    return TRACK_ID_TO_NAME.get(int(track_id))

def decode_text(value):
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
    return "".join(ch.lower() for ch in str(name) if ch.isalnum())

def iter_field_names(obj):
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
    try:
        qobj.put_nowait(item)
        return True
    except queue.Full:
        return False

def iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def extract_track_info_from_session_packet(pkt):
    track_id = parse_int(get_attr(pkt, "track_id", "m_trackId", default=None), None)
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
    }

    if payload == LAST_SESSION_META_SYNCED:
        return

    try:
        res = http.patch(f"{API_BASE}/sessions/{SESSION_ID}", json=payload, timeout=REQUEST_TIMEOUT)
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

def extract_event_code(event_pkt):
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

SESSION_ID = None
USER_ID = None
SESSION_END_DETECTED_AT = None
SESSION_END_DETECTED_MONO = None
SESSION_END_REASON = None
SESSION_END_PACKET_TYPE = None
LAST_PACKET_MONO = None
LAST_SAMPLE_TIMESTAMP = None

STOP_EVENT = threading.Event()

LATEST_QUEUE = queue.Queue(maxsize=1)
BATCH_QUEUE = queue.Queue(maxsize=2000)
LAP_QUEUE = queue.Queue(maxsize=200)
CORNER_QUEUE = queue.Queue(maxsize=500)

LAST_SAMPLE_SENT_AT = 0.0
CURRENT_LAP_NUM = None
BEST_LAP_TIME_MS = None
LAST_DELTA_TO_PB_MS = None

BRAKE_ACTIVE = False
BRAKE_START_DISTANCE_M = 0.0
LAST_BRAKE_SAMPLE_TIME = None

CURRENT_DRS_AVAILABLE = False
CURRENT_DRS_ACTIVATION_DISTANCE_M = None
DRS_AVAILABLE_SINCE_MONO = None
DRS_AVAILABLE_SINCE_LAP_DISTANCE_M = None
DRS_ACTIVATION_PENDING = False
LAST_DRS_ACTIVE = False

def prompt_identity():
    global DRIVER_USERNAME, DRIVER_EMAIL

    if not DRIVER_USERNAME:
        DRIVER_USERNAME = input("Username: ").strip()
    if not DRIVER_EMAIL:
        DRIVER_EMAIL = input("Email: ").strip()

    if not DRIVER_USERNAME:
        raise ValueError("Username is required")

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
    res = http.post(url, json=body, timeout=timeout)
    res.raise_for_status()
    return res

def queue_worker(qobj, label):
    while not STOP_EVENT.is_set() or not qobj.empty():
        try:
            endpoint, body, retries_left = qobj.get(timeout=0.1)
        except queue.Empty:
            continue

        if label == "latest":
            while True:
                try:
                    endpoint, body, retries_left = qobj.get_nowait()
                except queue.Empty:
                    break

        delay = 0.25 if label == "latest" else 0.5
        timeout = LATEST_REQUEST_TIMEOUT if label == "latest" else REQUEST_TIMEOUT

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

def create_user_and_session():
    global USER_ID, SESSION_ID

    while not STOP_EVENT.is_set():
        try:
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

            session_res = http.post(
                f"{API_BASE}/sessions",
                json={
                    "userId": USER_ID,
                    "trackName": TRACK_NAME,
                    "trackId": TRACK_ID,
                    "sessionType": SESSION_TYPE,
                },
                timeout=REQUEST_TIMEOUT,
            )
            session_res.raise_for_status()
            SESSION_ID = session_res.json()["id"]

            print("SUCCESS! USERNAME:", DRIVER_USERNAME, "| USER ID:", USER_ID, "| SESSION ID:", SESSION_ID)
            break
        except Exception as e:
            print(f"API not ready, retrying in 5s... ({e})")
            time.sleep(5)

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


def maybe_mark_idle_session_end(race_active, race_started_at):
    if SESSION_END_DETECTED_AT is not None or not SESSION_ID:
        return race_active, race_started_at

    if LAST_PACKET_MONO is None:
        return race_active, race_started_at

    if not race_active and LAST_SAMPLE_TIMESTAMP is None:
        return race_active, race_started_at

    if race_started_at is not None and (time.time() - race_started_at) < MIN_EVENT_END_AFTER_START_SEC:
        return race_active, race_started_at

    idle_for = time.time() - LAST_PACKET_MONO
    if idle_for >= SESSION_IDLE_END_TIMEOUT_SEC:
        mark_session_end(
            f"udp_idle_timeout_{SESSION_IDLE_END_TIMEOUT_SEC:.1f}s",
            "listener_idle_timeout",
            detected_at=LAST_SAMPLE_TIMESTAMP,
        )
        return False, None

    return race_active, race_started_at


def end_session_once(session_closed):
    if session_closed or not SESSION_ID:
        return True

    ended_at = SESSION_END_DETECTED_AT or LAST_SAMPLE_TIMESTAMP or iso_now()
    if SESSION_END_PACKET_TYPE == "listener_idle_timeout":
        end_source = "last_telemetry_sample_idle_timeout"
    elif SESSION_END_DETECTED_AT:
        end_source = "game_packet"
    elif LAST_SAMPLE_TIMESTAMP:
        end_source = "last_telemetry_sample"
    else:
        end_source = "listener_shutdown"
    end_reason = SESSION_END_REASON or (
        "manual_or_listener_shutdown" if not SESSION_END_DETECTED_AT else None
    )

    try:
        res = http.post(
            f"{API_BASE}/sessions/{SESSION_ID}/end",
            json={
                "endedAt": ended_at,
                "endedAtSource": end_source,
                "endReason": end_reason,
                "endPacketType": SESSION_END_PACKET_TYPE,
                "listenerClosedAt": iso_now(),
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
    return True

def get_lap_array(pkt):
    return get_attr(pkt, "lap_data", "m_lapData")

def handle_session_packet(pid, data, pkt_cls, race_active, race_started_at):
    global TRACK_ID, TRACK_NAME, SESSION_TYPE

    if pid != SESSION_PACKET_ID or pkt_cls is None:
        return race_active, race_started_at

    sess_pkt = pkt_cls.from_buffer_copy(data)
    session_type = int(get_attr(sess_pkt, "session_type", "mSessionType", "m_sessionType", default=0) or 0)
    SESSION_TYPE = session_type

    track_id, track_name = extract_track_info_from_session_packet(sess_pkt)
    TRACK_ID = track_id
    TRACK_NAME = track_name

    sync_session_metadata()

    is_race_session = session_type in RACE_SESSION_TYPES

    if is_race_session and not race_active:
        print("Grand Prix session started.")
        return True, time.time()

    if not is_race_session and race_active:
        mark_session_end("session_type_changed", "session_packet")
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
    global LAST_SAMPLE_SENT_AT, LAST_SAMPLE_TIMESTAMP
    global BRAKE_ACTIVE, BRAKE_START_DISTANCE_M, LAST_BRAKE_SAMPLE_TIME, TELEMETRY_BATCH
    global CURRENT_WORLD_X, CURRENT_WORLD_Y, CURRENT_WORLD_Z, CURRENT_YAW, CURRENT_PITCH, CURRENT_ROLL
    global DRS_ACTIVATION_PENDING, LAST_DRS_ACTIVE

    if not SESSION_ID or pkt is None:
        return

    now = time.time()
    if now - LAST_SAMPLE_SENT_AT < SAMPLE_MIN_INTERVAL_SEC:
        return

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
    LAST_SAMPLE_SENT_AT = now

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
        "playerCarIndex": player_idx,
        "currentSector": CURRENT_SECTOR,
        "pitStatus": CURRENT_PIT_STATUS,
    }

    update_corner_state_from_sample(sample_body)
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
    global DRIVER_USERNAME, LAST_PACKET_MONO

    prompt_identity()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    sock.settimeout(SOCKET_TIMEOUT_SEC)

    detected_name = sniff_player_name(sock, timeout_sec=10.0)
    if detected_name and not is_fake_name(detected_name):
        print("Detected in-game player name:", detected_name)
    else:
        print("Using username:", DRIVER_USERNAME)

    live_thread = threading.Thread(target=queue_worker, args=(LATEST_QUEUE, "latest"), daemon=True)
    batch_thread = threading.Thread(target=queue_worker, args=(BATCH_QUEUE, "batch"), daemon=True)
    lap_thread = threading.Thread(target=queue_worker, args=(LAP_QUEUE, "lap"), daemon=True)
    corner_thread = threading.Thread(target=queue_worker, args=(CORNER_QUEUE, "corner"), daemon=True)

    live_thread.start()
    batch_thread.start()
    lap_thread.start()
    corner_thread.start()

    create_user_and_session()

    race_active = False
    race_started_at = None
    session_closed = False
    rows_buffer = []

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
                    race_active, race_started_at = maybe_mark_idle_session_end(race_active, race_started_at)
                    if (
                        SESSION_END_DETECTED_MONO is not None
                        and time.time() - SESSION_END_DETECTED_MONO >= SESSION_END_GRACE_PERIOD_SEC
                    ):
                        print(f"End grace window complete ({SESSION_END_GRACE_PERIOD_SEC:.1f}s). Closing listener session.")
                        STOP_EVENT.set()
                    continue

                LAST_PACKET_MONO = time.time()

                header_size = ctypes.sizeof(PacketHeader)
                if len(data) < header_size:
                    continue

                try:
                    header = PacketHeader.from_buffer_copy(data[:header_size])
                except Exception:
                    continue

                pid = int(get_attr_loose(header, "packet_id", "packetId", "mPacketId", "m_packetId", default=0) or 0)
                pkt_cls = pick_packet_class(header)

                pkt = None
                if pkt_cls is not None:
                    try:
                        pkt = pkt_cls.from_buffer_copy(data)
                    except Exception:
                        pkt = None

                race_active, race_started_at = handle_session_packet(pid, data, pkt_cls, race_active, race_started_at)
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
                    print(f"End grace window complete ({SESSION_END_GRACE_PERIOD_SEC:.1f}s). Closing listener session.")
                    STOP_EVENT.set()

    except KeyboardInterrupt:
        print("\nStopped. Saving resources...")

    finally:
        if TELEMETRY_BATCH and SESSION_ID:
            safe_enqueue(BATCH_QUEUE, (
                "/telemetry/batch",
                {
                    "sessionId": SESSION_ID,
                    "samples": list(TELEMETRY_BATCH),
                },
                1,
            ))
            TELEMETRY_BATCH.clear()

        flush_active_corner(end_reason="shutdown")

        if rows_buffer:
            try:
                with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    w.writerows(rows_buffer)
            except Exception:
                pass

        STOP_EVENT.set()
        try:
            live_thread.join(timeout=3)
            batch_thread.join(timeout=3)
            lap_thread.join(timeout=3)
            corner_thread.join(timeout=3)
        except Exception:
            pass

        session_closed = end_session_once(session_closed)
        sock.close()

if __name__ == "__main__":
    main()



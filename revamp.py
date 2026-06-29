import csv
import socket
import time
import ctypes
import queue
import threading
import os
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
PARTICIPANTS_PACKET_ID = 4
TELEMETRY_PACKET_ID = 6
FINAL_CLASS_PACKET_ID = 8
TIME_TRIAL_PACKET_ID = 14  # adjust only if your packet map uses a different ID

RACE_SESSION_TYPES = {15, 16, 17}
MIN_EVENT_END_AFTER_START_SEC = 10.0

REQUEST_TIMEOUT = (5.0, 10.0)
SOCKET_TIMEOUT_SEC = 1.0
SAMPLE_MIN_INTERVAL_SEC = 0.1
CSV_FLUSH_EVERY_ROWS = 25

BATCH_SIZE = 20
TELEMETRY_BATCH = []

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

# Latest world-space car position from the Motion packet.
# Use worldX/worldZ for 2D track-map overlays. worldY is height/elevation.
CURRENT_WORLD_X = None
CURRENT_WORLD_Y = None
CURRENT_WORLD_Z = None
CURRENT_YAW = None
CURRENT_PITCH = None
CURRENT_ROLL = None

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

CURRENT_SECTOR = None

LAST_LAP_SNAPSHOT = {
    "lapNumber": None,
    "sector1Ms": None,
    "sector2Ms": None,
    "sector3Ms": None,
    "valid": None,
}

LATEST_TIME_TRIAL_DATA = {
    "playerSessionBest": None,
    "personalBest": None,
    "updatedAt": None,
}

SESSION_ID = None
USER_ID = None

STOP_EVENT = threading.Event()

LATEST_QUEUE = queue.Queue(maxsize=200)
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


def parse_truthy(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    s = str(value).strip().lower()
    if s in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if s in {"0", "false", "f", "no", "n", "off", ""}:
        return False
    return bool(s)


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


def safe_enqueue(qobj, item):
    try:
        qobj.put_nowait(item)
        return True
    except queue.Full:
        return False


def iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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


def get_track_name(track_id):
    if track_id is None:
        return None
    return TRACK_ID_TO_NAME.get(int(track_id))


def extract_track_info_from_session_packet(pkt):
    track_id = parse_int(get_attr(pkt, "track_id", "m_trackId", default=None), None)
    return track_id, get_track_name(track_id)


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
    fmt = int(get_attr(header, "packet_format", "m_packetFormat", default=0) or 0)
    ver = int(get_attr(header, "packet_version", "m_packetVersion", default=0) or 0)
    pid = int(get_attr(header, "packet_id", "m_packetId", default=0) or 0)
    year = int(get_attr(header, "game_year", "m_gameYear", default=0) or 0)

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


def parse_sector_time_combined(minutes_part, ms_part):
    minutes = parse_int(minutes_part, 0) or 0
    ms = parse_int(ms_part, None)
    if ms is None:
        return None
    return (minutes * 60000) + ms


def extract_current_sector(lap):
    return parse_int(
        get_attr(
            lap,
            "sector",
            "Sector",
            "mSector",
            "m_sector",
            "current_sector",
            "currentSector",
            "mCurrentSector",
            "m_currentSector",
            default=None,
        ),
        None,
    )


def extract_lap_validity(lap):
    invalid_fields = (
        "current_lap_invalid",
        "mCurrentLapInvalid",
        "m_currentLapInvalid",
        "last_lap_invalid",
        "mLastLapInvalid",
        "m_lastLapInvalid",
        "invalid",
    )
    valid_fields = (
        "current_lap_valid",
        "mCurrentLapValid",
        "m_currentLapValid",
        "last_lap_valid",
        "mLastLapValid",
        "m_lastLapValid",
        "valid",
    )

    for field in invalid_fields:
        raw = get_attr(lap, field, default=None)
        if raw is not None:
            return not parse_truthy(raw)

    for field in valid_fields:
        raw = get_attr(lap, field, default=None)
        if raw is not None:
            return parse_truthy(raw)

    return None


def extract_lap_sector_times(lap):
    # F1 25 layout
    sector1_ms = parse_sector_time_combined(
        get_attr(
            lap,
            "sector1_time_minutes_part",
            "sector1TimeMinutesPart",
            "mSector1TimeMinutesPart",
            "m_sector1TimeMinutesPart",
            default=None,
        ),
        get_attr(
            lap,
            "sector1_time_ms_part",
            "sector1TimeMSPart",
            "mSector1TimeMSPart",
            "m_sector1TimeMSPart",
            default=None,
        ),
    )
    sector2_ms = parse_sector_time_combined(
        get_attr(
            lap,
            "sector2_time_minutes_part",
            "sector2TimeMinutesPart",
            "mSector2TimeMinutesPart",
            "m_sector2TimeMinutesPart",
            default=None,
        ),
        get_attr(
            lap,
            "sector2_time_ms_part",
            "sector2TimeMSPart",
            "mSector2TimeMSPart",
            "m_sector2TimeMSPart",
            default=None,
        ),
    )

    # Older / alternate layouts fallback
    if sector1_ms is None:
        sector1_ms = parse_int(
            get_attr(
                lap,
                "sector1_time_in_ms",
                "sector1TimeInMS",
                "mSector1TimeInMS",
                "m_sector1TimeInMS",
                default=None,
            ),
            None,
        )
    if sector2_ms is None:
        sector2_ms = parse_int(
            get_attr(
                lap,
                "sector2_time_in_ms",
                "sector2TimeInMS",
                "mSector2TimeInMS",
                "m_sector2TimeInMS",
                default=None,
            ),
            None,
        )
    sector3_ms = parse_int(
        get_attr(
            lap,
            "sector3_time_in_ms",
            "sector3TimeInMS",
            "mSector3TimeInMS",
            "m_sector3TimeInMS",
            default=None,
        ),
        None,
    )
    return sector1_ms, sector2_ms, sector3_ms


def extract_lap_snapshot(lap):
    sector1_ms, sector2_ms, sector3_ms = extract_lap_sector_times(lap)
    lap_valid = extract_lap_validity(lap)
    return {
        "sector1Ms": sector1_ms,
        "sector2Ms": sector2_ms,
        "sector3Ms": sector3_ms,
        "valid": lap_valid,
    }


def get_time_trial_sectors_for_lap(lap_time_ms):
    if lap_time_ms is None:
        return None, None, None, None

    for key in ("playerSessionBest", "personalBest"):
        ds = LATEST_TIME_TRIAL_DATA.get(key)
        if not ds:
            continue
        if ds.get("lapTimeMs") == lap_time_ms:
            return (
                ds.get("sector1Ms"),
                ds.get("sector2Ms"),
                ds.get("sector3Ms"),
                ds.get("valid"),
            )

    return None, None, None, None


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


def extract_player_name_from_participants(header, pkt):
    arr = get_attr(pkt, "participants", "m_participants")
    if arr is None or len(arr) == 0:
        return None

    player_idx = int(get_attr(header, "player_car_index", "m_playerCarIndex", default=0) or 0)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    participant = arr[player_idx]

    for field in ("name", "m_name", "driver_name", "m_driverName"):
        raw = get_attr(participant, field, default=None)
        name = decode_text(raw)
        if name:
            return name

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

            pid = int(get_attr(header, "packet_id", "m_packetId", default=0) or 0)
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

        delay = 0.5
        for attempt in range(retries_left + 1):
            try:
                post_json(endpoint, body)
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


def end_session_once(session_closed):
    if session_closed or not SESSION_ID:
        return True
    try:
        http.post(f"{API_BASE}/sessions/{SESSION_ID}/end", timeout=REQUEST_TIMEOUT)
    except Exception as e:
        print("Session end API error:", e)
    return True


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
        "minSpeedKph": CORNER_START.get("minSpeedKph"),
        "maxBrake": CORNER_START.get("maxBrake", 0.0),
        "maxThrottle": CORNER_START.get("maxThrottle", 0.0),
        "maxAbsSteering": CORNER_START.get("maxAbsSteering", 0.0),
        "sampleCount": CORNER_START.get("sampleCount", 0),

        "startWorldX": CORNER_START.get("startWorldX"),
        "startWorldY": CORNER_START.get("startWorldY"),
        "startWorldZ": CORNER_START.get("startWorldZ"),
        "endWorldX": end_sample.get("worldX"),
        "endWorldY": end_sample.get("worldY"),
        "endWorldZ": end_sample.get("worldZ"),

        "apexLapDistanceM": CORNER_START.get("apexLapDistanceM"),
        "apexWorldX": CORNER_START.get("apexWorldX"),
        "apexWorldY": CORNER_START.get("apexWorldY"),
        "apexWorldZ": CORNER_START.get("apexWorldZ"),
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
                "minSpeedKph": sample_body.get("speedKph"),
                "maxBrake": sample_body.get("brake") or 0.0,
                "maxThrottle": sample_body.get("throttle") or 0.0,
                "maxAbsSteering": steering_abs,
                "sampleCount": 1,
                "startWorldX": sample_body.get("worldX"),
                "startWorldY": sample_body.get("worldY"),
                "startWorldZ": sample_body.get("worldZ"),
                "apexLapDistanceM": lap_distance,
                "apexWorldX": sample_body.get("worldX"),
                "apexWorldY": sample_body.get("worldY"),
                "apexWorldZ": sample_body.get("worldZ"),
            }
    else:
        CORNER_START["sampleCount"] = int(CORNER_START.get("sampleCount", 0) or 0) + 1

        speed = sample_body.get("speedKph")
        if speed is not None:
            current_min = CORNER_START.get("minSpeedKph")
            if current_min is None or speed < current_min:
                CORNER_START["minSpeedKph"] = speed

        CORNER_START["maxBrake"] = max(CORNER_START.get("maxBrake", 0.0), sample_body.get("brake") or 0.0)
        CORNER_START["maxThrottle"] = max(CORNER_START.get("maxThrottle", 0.0), sample_body.get("throttle") or 0.0)

        if steering_abs > CORNER_START.get("maxAbsSteering", 0.0):
            CORNER_START["maxAbsSteering"] = steering_abs
            CORNER_START["apexLapDistanceM"] = lap_distance
            CORNER_START["apexWorldX"] = sample_body.get("worldX")
            CORNER_START["apexWorldY"] = sample_body.get("worldY")
            CORNER_START["apexWorldZ"] = sample_body.get("worldZ")

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



def get_motion_array(pkt):
    return get_attr(pkt, "car_motion_data", "m_carMotionData")


def update_motion_state_from_packet(header, pkt):
    """
    Reads the Motion packet and stores the player's latest world-space position.
    F1 world coordinates are what the website should align to a track image.

    2D map overlay:
      worldX -> horizontal game coordinate
      worldZ -> vertical/depth game coordinate
      worldY -> elevation/height
    """
    global CURRENT_WORLD_X, CURRENT_WORLD_Y, CURRENT_WORLD_Z
    global CURRENT_YAW, CURRENT_PITCH, CURRENT_ROLL

    arr = get_motion_array(pkt)
    if arr is None or len(arr) == 0:
        return

    player_idx = int(get_attr(header, "player_car_index", "mPlayerCarIndex", "m_playerCarIndex", default=0) or 0)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    car = arr[player_idx]

    CURRENT_WORLD_X = parse_number(get_attr(
        car,
        "world_position_x",
        "worldPositionX",
        "m_worldPositionX",
        "m_world_position_x",
        default=None,
    ), None)

    CURRENT_WORLD_Y = parse_number(get_attr(
        car,
        "world_position_y",
        "worldPositionY",
        "m_worldPositionY",
        "m_world_position_y",
        default=None,
    ), None)

    CURRENT_WORLD_Z = parse_number(get_attr(
        car,
        "world_position_z",
        "worldPositionZ",
        "m_worldPositionZ",
        "m_world_position_z",
        default=None,
    ), None)

    CURRENT_YAW = parse_number(get_attr(car, "yaw", "m_yaw", default=None), None)
    CURRENT_PITCH = parse_number(get_attr(car, "pitch", "m_pitch", default=None), None)
    CURRENT_ROLL = parse_number(get_attr(car, "roll", "m_roll", default=None), None)


def get_lap_array(pkt):
    return get_attr(pkt, "lap_data", "m_lapData")


def update_time_trial_state(pkt):
    global LATEST_TIME_TRIAL_DATA

    player_ds = get_attr(pkt, "player_session_best_data_set", "m_playerSessionBestDataSet", default=None)
    personal_ds = get_attr(pkt, "personal_best_data_set", "m_personalBestDataSet", default=None)

    def read_dataset(ds):
        if ds is None:
            return None
        return {
            "lapTimeMs": parse_int(get_attr(ds, "lap_time_in_ms", "m_lapTimeInMS", default=None), None),
            "sector1Ms": parse_int(get_attr(ds, "sector1_time_in_ms", "m_sector1TimeInMS", default=None), None),
            "sector2Ms": parse_int(get_attr(ds, "sector2_time_in_ms", "m_sector2TimeInMS", default=None), None),
            "sector3Ms": parse_int(get_attr(ds, "sector3_time_in_ms", "m_sector3TimeInMS", default=None), None),
            "valid": parse_truthy(get_attr(ds, "valid", "m_valid", default=False)),
            "carIdx": parse_int(get_attr(ds, "car_idx", "m_carIdx", default=None), None),
            "teamId": parse_int(get_attr(ds, "team_id", "m_teamId", default=None), None),
        }

    LATEST_TIME_TRIAL_DATA = {
        "playerSessionBest": read_dataset(player_ds),
        "personalBest": read_dataset(personal_ds),
        "updatedAt": iso_now(),
    }


def update_lap_state_from_packet(header, pkt):
    global CURRENT_LAP_NUM, BEST_LAP_TIME_MS, LAST_DELTA_TO_PB_MS
    global CURRENT_LAP_DISTANCE_M, CURRENT_TOTAL_DISTANCE_M, LAST_LAP_SNAPSHOT

    def is_plausible_lap_time_ms(ms):
        return ms is not None and 10000 <= ms <= 600000

    arr = get_lap_array(pkt)
    if arr is None or len(arr) == 0:
        return

    player_idx = int(get_attr(header, "player_car_index", "mPlayerCarIndex", "m_playerCarIndex", default=0) or 0)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    lap = arr[player_idx]

    current_lap = parse_int(get_attr(lap, "current_lap_num", "mCurrentLapNum", "m_currentLapNum", default=None), None)
    last_lap_time = parse_int(get_attr(lap, "last_lap_time_in_ms", "mLastLapTimeInMS", "m_lastLapTimeInMS", default=None), None)

    lap_distance = parse_number(get_attr(lap, "lap_distance", "mLapDistance", "m_lapDistance", default=None), None)
    total_distance = parse_number(get_attr(lap, "total_distance", "mTotalDistance", "m_totalDistance", default=None), None)
    CURRENT_LAP_DISTANCE_M = lap_distance
    CURRENT_TOTAL_DISTANCE_M = total_distance

    current_snapshot = extract_lap_snapshot(lap)
    current_snapshot["lapNumber"] = current_lap

    global CURRENT_SECTOR
    CURRENT_SECTOR = extract_current_sector(lap)

    # If lap number increased, the lap that just finished is the previous one
    if current_lap is not None and CURRENT_LAP_NUM is not None and current_lap > CURRENT_LAP_NUM:
        completed = dict(LAST_LAP_SNAPSHOT)
        completed["lapNumber"] = CURRENT_LAP_NUM

        sector1_ms = completed.get("sector1Ms")
        sector2_ms = completed.get("sector2Ms")
        sector3_ms = completed.get("sector3Ms")
        lap_valid = completed.get("valid")

        # Prefer exact Time Trial sectors when available
        tt_sector1, tt_sector2, tt_sector3, tt_valid = get_time_trial_sectors_for_lap(last_lap_time)
        if tt_sector1 is not None or tt_sector2 is not None or tt_sector3 is not None:
            sector1_ms = tt_sector1 if tt_sector1 is not None else sector1_ms
            sector2_ms = tt_sector2 if tt_sector2 is not None else sector2_ms
            sector3_ms = tt_sector3 if tt_sector3 is not None else sector3_ms
            if tt_valid is not None:
                lap_valid = tt_valid

        if lap_valid is None:
            lap_valid = True

        if sector3_ms is None and last_lap_time is not None and sector1_ms is not None and sector2_ms is not None:
            sector3_ms = max(0, last_lap_time - sector1_ms - sector2_ms)

        if SESSION_ID and is_plausible_lap_time_ms(last_lap_time):
            safe_enqueue(LAP_QUEUE, (
                f"/sessions/{SESSION_ID}/laps",
                {
                    "lapNumber": CURRENT_LAP_NUM,
                    "lapTimeMs": last_lap_time,
                    "sector1Ms": sector1_ms,
                    "sector2Ms": sector2_ms,
                    "sector3Ms": sector3_ms,
                    "valid": lap_valid,
                    "trackName": TRACK_NAME,
                    "trackId": TRACK_ID,
                },
                3,
            ))
        else:
            print(f"Ignoring implausible lap time: {last_lap_time} ms")

    if current_lap is not None:
        CURRENT_LAP_NUM = current_lap

    LAST_LAP_SNAPSHOT = current_snapshot

    current_lap_time_ms = parse_int(
        get_attr(lap, "current_lap_time_in_ms", "mCurrentLapTimeInMS", "m_currentLapTimeInMS", default=None),
        None,
    )
    best_lap_time_ms = parse_int(
        get_attr(lap, "best_lap_time_in_ms", "mBestLapTimeInMS", "m_bestLapTimeInMS", default=None),
        None,
    )

    if best_lap_time_ms is not None and is_plausible_lap_time_ms(best_lap_time_ms):
        if BEST_LAP_TIME_MS is None or best_lap_time_ms < BEST_LAP_TIME_MS:
            BEST_LAP_TIME_MS = best_lap_time_ms
    elif current_lap_time_ms is not None and is_plausible_lap_time_ms(current_lap_time_ms) and BEST_LAP_TIME_MS is None:
        BEST_LAP_TIME_MS = current_lap_time_ms

    if current_lap_time_ms is not None and BEST_LAP_TIME_MS is not None:
        LAST_DELTA_TO_PB_MS = current_lap_time_ms - BEST_LAP_TIME_MS
    else:
        LAST_DELTA_TO_PB_MS = None


def enqueue_latest(item):
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


def post_telemetry_sample(header, pkt):
    global LAST_SAMPLE_SENT_AT
    global BRAKE_ACTIVE, BRAKE_START_DISTANCE_M, LAST_BRAKE_SAMPLE_TIME, TELEMETRY_BATCH
    global CURRENT_WORLD_X, CURRENT_WORLD_Y, CURRENT_WORLD_Z, CURRENT_YAW, CURRENT_PITCH, CURRENT_ROLL

    if not SESSION_ID or pkt is None:
        return

    now = time.time()
    if now - LAST_SAMPLE_SENT_AT < SAMPLE_MIN_INTERVAL_SEC:
        return

    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData")
    if arr is None or len(arr) == 0:
        return

    player_idx = int(get_attr(header, "player_car_index", "mPlayerCarIndex", "m_playerCarIndex", default=0) or 0)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    t = arr[player_idx]

    speed = int(parse_int(get_attr(t, "speed", "m_speed", default=0), 0) or 0)
    throttle = float(parse_number(get_attr(t, "throttle", "m_throttle", default=0.0), 0.0) or 0.0)
    brake = float(parse_number(get_attr(t, "brake", "m_brake", default=0.0), 0.0) or 0.0)
    steering = float(parse_number(get_attr(t, "steer", "m_steer", default=0.0), 0.0) or 0.0)
    rpm = int(parse_int(
        get_attr(
            t,
            "engineRPM",
            "EngineRPM",
            "engine_rpm",
            "m_engineRPM",
            "m_engine_rpm",
            "rpm",
            default=0,
        ),
        0,
    ) or 0)
    gear = int(parse_int(get_attr(t, "gear", "m_gear", default=0), 0) or 0)
    drs = bool(int(parse_int(get_attr(t, "drs", "m_drs", default=0), 0) or 0))

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

    sample_body = {
        "timestamp": iso_now(),
        "sampleIndex": get_frame_identifier(header, pkt),
        "gameTimeMs": get_attr(header, "session_time", "mSessionTime", "m_sessionTime", default=None),
        "lapNumber": CURRENT_LAP_NUM,
        "lapDistance": CURRENT_LAP_DISTANCE_M,
        "totalDistance": CURRENT_TOTAL_DISTANCE_M,

        # Map/position fields for website overlays.
        # Store these in Firebase and map worldX/worldZ to image coordinates in the frontend.
        "worldX": CURRENT_WORLD_X,
        "worldY": CURRENT_WORLD_Y,
        "worldZ": CURRENT_WORLD_Z,
        "yaw": CURRENT_YAW,
        "pitch": CURRENT_PITCH,
        "roll": CURRENT_ROLL,

        "trackId": TRACK_ID,
        "trackName": TRACK_NAME,

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
        "playerCarIndex": player_idx,
        "currentSector": CURRENT_SECTOR,
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
        print("Grand Prix session ended.")
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
        print("Grand Prix session ended.")
        return False, None

    return race_active, race_started_at


def handle_final_class_packet(pid, race_active, race_started_at):
    if pid == FINAL_CLASS_PACKET_ID and race_active:
        print("Grand Prix session ended.")
        return False, None
    return race_active, race_started_at


def main():
    global DRIVER_USERNAME

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
                "track_id",
                "track_name",
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
            ])

            print("\nListening for telemetry... (CTRL+C to stop)")

            while not STOP_EVENT.is_set():
                try:
                    data, addr = sock.recvfrom(4096)
                except socket.timeout:
                    continue

                header_size = ctypes.sizeof(PacketHeader)
                if len(data) < header_size:
                    continue

                try:
                    header = PacketHeader.from_buffer_copy(data[:header_size])
                except Exception:
                    continue

                pid = int(get_attr(header, "packet_id", "mPacketId", "m_packetId", default=0) or 0)
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

                if pid == TIME_TRIAL_PACKET_ID and pkt is not None:
                    update_time_trial_state(pkt)

                if pid == LAP_DATA_PACKET_ID and pkt is not None:
                    update_lap_state_from_packet(header, pkt)

                if pid == TELEMETRY_PACKET_ID and pkt is not None:
                    post_telemetry_sample(header, pkt)

                    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData")
                    if arr is not None and len(arr) > 0:
                        idx = int(get_attr(header, "player_car_index", "mPlayerCarIndex", "m_playerCarIndex", default=0) or 0)
                        if not (0 <= idx < len(arr)):
                            idx = 0

                        t = arr[idx]
                        speed = int(parse_int(get_attr(t, "speed", "m_speed", default=0), 0) or 0)
                        throttle = float(parse_number(get_attr(t, "throttle", "m_throttle", default=0.0), 0.0) or 0.0)
                        brake = float(parse_number(get_attr(t, "brake", "m_brake", default=0.0), 0.0) or 0.0)
                        steering = float(parse_number(get_attr(t, "steer", "m_steer", default=0.0), 0.0) or 0.0)
                        rpm = int(parse_int(get_attr(t, "engineRPM", "m_engineRPM", "rpm", default=0), 0) or 0)
                        gear = int(parse_int(get_attr(t, "gear", "m_gear", default=0), 0) or 0)
                        drs = bool(int(parse_int(get_attr(t, "drs", "m_drs", default=0), 0) or 0))

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
                            TRACK_ID,
                            TRACK_NAME,
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
                        ])

                        if len(rows_buffer) >= CSV_FLUSH_EVERY_ROWS:
                            w.writerows(rows_buffer)
                            f.flush()
                            rows_buffer.clear()

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

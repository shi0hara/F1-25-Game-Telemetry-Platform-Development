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

SESSION_PACKET_ID = 1
LAP_DATA_PACKET_ID = 2
EVENT_PACKET_ID = 3
TELEMETRY_PACKET_ID = 6
FINAL_CLASS_PACKET_ID = 8

RACE_SESSION_TYPES = {15, 16, 17}
MIN_EVENT_END_AFTER_START_SEC = 10.0

REQUEST_TIMEOUT = (5.0, 10.0)
SOCKET_TIMEOUT_SEC = 1.0
SAMPLE_MIN_INTERVAL_SEC = 0.1
CSV_FLUSH_EVERY_ROWS = 25

BATCH_SIZE = 20
TELEMETRY_BATCH = []

PARTICIPANTS_PACKET_ID = 4
PLAYER_NAME = os.getenv("PLAYER_NAME", getpass.getuser())
PLAYER_NAME_DETECTED = False

TRACK_NAME = None
TRACK_ID = None
SESSION_TYPE = None

def extract_track_info_from_session_packet(pkt):
    track_id = parse_int(get_attr(pkt, "track_id", "m_trackId", default=None), None)
    track_name = None

    for field in ("track", "track_name", "m_track", "m_trackName", "circuit", "circuit_name"):
        raw = get_attr(pkt, field, default=None)
        track_name = decode_text(raw)
        if track_name:
            break

    return track_id, track_name

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
PLAYER_ID = None

STOP_EVENT = threading.Event()

LATEST_QUEUE = queue.Queue(maxsize=200)
BATCH_QUEUE = queue.Queue(maxsize=2000)
LAP_QUEUE = queue.Queue(maxsize=200)

LAST_SAMPLE_SENT_AT = 0.0
CURRENT_LAP_NUM = None
BEST_LAP_TIME_MS = None
LAST_DELTA_TO_PB_MS = None

BRAKE_ACTIVE = False
BRAKE_START_DISTANCE_M = 0.0
LAST_BRAKE_SAMPLE_TIME = None


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

def get_attr(obj, *names, default=None):
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    return default


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


def iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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


def safe_enqueue(qobj, item):
    try:
        qobj.put_nowait(item)
        return True
    except queue.Full:
        return False


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


def create_player_and_session():
    global PLAYER_ID, SESSION_ID, PLAYER_NAME

    while not STOP_EVENT.is_set():
        try:
            print(f"Connecting to backend at {API_BASE} as '{PLAYER_NAME}' ...")

            player_res = http.post(
                f"{API_BASE}/players",
                json={"name": PLAYER_NAME},
                timeout=REQUEST_TIMEOUT,
            )
            player_res.raise_for_status()
            player_data = player_res.json()
            PLAYER_ID = player_data["id"]

            session_res = http.post(
                f"{API_BASE}/sessions",
                json={
                    "playerId": PLAYER_ID,
                    "playerName": PLAYER_NAME,
                    "trackName": TRACK_NAME,
                    "trackId": TRACK_ID,
                    "sessionType": SESSION_TYPE,
                },
                timeout=REQUEST_TIMEOUT,
            )
            session_res.raise_for_status()
            SESSION_ID = session_res.json()["id"]

            print("SUCCESS! PLAYER NAME:", PLAYER_NAME, "| PLAYER ID:", PLAYER_ID, "| SESSION ID:", SESSION_ID)
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


def get_lap_array(pkt):
    return get_attr(pkt, "lap_data", "m_lapData")


def handle_session_packet(pid, data, pkt_cls, race_active, race_started_at):
    global TRACK_ID, TRACK_NAME, SESSION_TYPE

    if pid != SESSION_PACKET_ID or pkt_cls is None:
        return race_active, race_started_at

    sess_pkt = pkt_cls.from_buffer_copy(data)
    session_type = int(get_attr(sess_pkt, "session_type", "m_sessionType", default=0) or 0)
    SESSION_TYPE = session_type

    track_id, track_name = extract_track_info_from_session_packet(sess_pkt)
    if track_id is not None:
        TRACK_ID = track_id
    if track_name:
        TRACK_NAME = track_name

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


def update_lap_state_from_packet(header, pkt):
    global CURRENT_LAP_NUM, BEST_LAP_TIME_MS, LAST_DELTA_TO_PB_MS

    arr = get_lap_array(pkt)
    if arr is None or len(arr) == 0:
        return

    player_idx = int(get_attr(header, "player_car_index", "m_playerCarIndex", default=0) or 0)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    lap = arr[player_idx]

    current_lap = parse_int(get_attr(lap, "current_lap_num", "m_currentLapNum", default=None), None)
    last_lap_time = parse_int(get_attr(lap, "last_lap_time_in_ms", "m_lastLapTimeInMS", default=None), None)

    if current_lap is not None:
        if CURRENT_LAP_NUM is not None and current_lap > CURRENT_LAP_NUM:
            print(f"\n---> LAP {CURRENT_LAP_NUM} COMPLETED! Time: {last_lap_time} ms <---\n")
            if SESSION_ID and last_lap_time is not None:
                safe_enqueue(LAP_QUEUE, (
                    f"/sessions/{SESSION_ID}/laps",
                    {
                        "lapNumber": CURRENT_LAP_NUM,
                        "lapTimeMs": last_lap_time,
                        "trackName": TRACK_NAME,
                        "trackId": TRACK_ID,
                    },
                    3,
                ))
        CURRENT_LAP_NUM = current_lap

    current_lap_time_ms = parse_int(get_attr(lap, "current_lap_time_in_ms", "m_currentLapTimeInMS", default=None), None)
    best_lap_time_ms = parse_int(get_attr(lap, "best_lap_time_in_ms", "m_bestLapTimeInMS", default=None), None)

    if best_lap_time_ms is not None and best_lap_time_ms > 0:
        if BEST_LAP_TIME_MS is None or best_lap_time_ms < BEST_LAP_TIME_MS:
            BEST_LAP_TIME_MS = best_lap_time_ms
    elif current_lap_time_ms is not None and current_lap_time_ms > 0 and BEST_LAP_TIME_MS is None:
        BEST_LAP_TIME_MS = current_lap_time_ms

    if current_lap_time_ms is not None and BEST_LAP_TIME_MS is not None:
        LAST_DELTA_TO_PB_MS = current_lap_time_ms - BEST_LAP_TIME_MS
    else:
        LAST_DELTA_TO_PB_MS = None


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

    if not SESSION_ID or pkt is None:
        return

    now = time.time()
    if now - LAST_SAMPLE_SENT_AT < SAMPLE_MIN_INTERVAL_SEC:
        return

    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData")
    if arr is None or len(arr) == 0:
        return

    player_idx = int(get_attr(header, "player_car_index", "m_playerCarIndex", default=0) or 0)
    if not (0 <= player_idx < len(arr)):
        player_idx = 0

    t = arr[player_idx]

    speed = int(parse_int(get_attr(t, "speed", "m_speed", default=0), 0) or 0)
    throttle = float(parse_number(get_attr(t, "throttle", "m_throttle", default=0.0), 0.0) or 0.0)
    brake = float(parse_number(get_attr(t, "brake", "m_brake", default=0.0), 0.0) or 0.0)
    steering = float(parse_number(get_attr(t, "steer", "m_steer", default=0.0), 0.0) or 0.0)
    rpm = int(parse_int(get_attr(t, "engineRPM", "m_engineRPM", "rpm", default=0), 0) or 0)
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
        "gameTimeMs": get_attr(header, "session_time", "m_sessionTime", default=None),
        "lapNumber": CURRENT_LAP_NUM,
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
    }

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
    global PLAYER_NAME

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    sock.settimeout(SOCKET_TIMEOUT_SEC)

    detected_name = sniff_player_name(sock, timeout_sec=10.0)
    if detected_name and not is_fake_name(detected_name):
        PLAYER_NAME = detected_name
        print("Detected in-game player name:", PLAYER_NAME)
    else:
        print("Using fallback player name:", PLAYER_NAME)

    live_thread = threading.Thread(target=queue_worker, args=(LATEST_QUEUE, "latest"), daemon=True)
    batch_thread = threading.Thread(target=queue_worker, args=(BATCH_QUEUE, "batch"), daemon=True)
    lap_thread = threading.Thread(target=queue_worker, args=(LAP_QUEUE, "lap"), daemon=True)

    live_thread.start()
    batch_thread.start()
    lap_thread.start()

    create_player_and_session()

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

                pid = int(get_attr(header, "packet_id", "m_packetId", default=0) or 0)
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

                if pid == LAP_DATA_PACKET_ID and pkt is not None:
                    update_lap_state_from_packet(header, pkt)

                if pid == TELEMETRY_PACKET_ID and pkt is not None:
                    post_telemetry_sample(header, pkt)

                    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData")
                    if arr is not None and len(arr) > 0:
                        idx = int(get_attr(header, "player_car_index", "m_playerCarIndex", default=0) or 0)
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
        except Exception:
            pass

        session_closed = end_session_once(session_closed)
        sock.close()


if __name__ == "__main__":
    main()

import csv
import socket
import time
from datetime import datetime, timezone
import ctypes

import requests

from f1.packets import PacketHeader, HEADER_FIELD_TO_PACKET_TYPE

API_BASE = "https://f1-telementry-1.onrender.com"
UDP_IP = "0.0.0.0"
UDP_PORT = 20777
CSV_PATH = "telemetry_live.csv"

PRINT_HEADERS = True
HEADER_PRINT_EVERY_SEC = 0.5

# F1 25 packet IDs from the UDP guide
MOTION_PACKET_ID = 0
SESSION_PACKET_ID = 1
LAP_DATA_PACKET_ID = 2
EVENT_PACKET_ID = 3
PARTICIPANTS_PACKET_ID = 4
CAR_SETUPS_PACKET_ID = 5
TELEMETRY_PACKET_ID = 6
CAR_STATUS_PACKET_ID = 7
FINAL_CLASS_PACKET_ID = 8
LOBBY_INFO_PACKET_ID = 9
CAR_DAMAGE_PACKET_ID = 10
SESSION_HISTORY_PACKET_ID = 11
TYRE_SETS_PACKET_ID = 12
MOTION_EX_PACKET_ID = 13
TIME_TRIAL_PACKET_ID = 14
LAP_POSITIONS_PACKET_ID = 15

RACE_SESSION_TYPES = {15}  # F1 25 guide: 15 = Race
MIN_EVENT_END_AFTER_START_SEC = 10.0

http = requests.Session()
http.headers.update({"Content-Type": "application/json"})

SESSION_ID = None
PLAYER_ID = None

# For throttling sample posts
LAST_SAMPLE_SENT_AT = 0.0
SAMPLE_MIN_INTERVAL_SEC = 0.1

# Packets that are especially useful to persist as generic telemetry records.
# The API can store all packets, but these are the most valuable.
IMPORTANT_PACKET_IDS = {
    MOTION_PACKET_ID,
    SESSION_PACKET_ID,
    LAP_DATA_PACKET_ID,
    EVENT_PACKET_ID,
    PARTICIPANTS_PACKET_ID,
    CAR_SETUPS_PACKET_ID,
    TELEMETRY_PACKET_ID,
    CAR_STATUS_PACKET_ID,
    FINAL_CLASS_PACKET_ID,
    LOBBY_INFO_PACKET_ID,
    CAR_DAMAGE_PACKET_ID,
    SESSION_HISTORY_PACKET_ID,
    TYRE_SETS_PACKET_ID,
    MOTION_EX_PACKET_ID,
    TIME_TRIAL_PACKET_ID,
    LAP_POSITIONS_PACKET_ID,
}


def detect_key_shape(mapping):
    k = next(iter(mapping.keys()))
    if isinstance(k, int):
        return ("int", 1)
    if isinstance(k, tuple):
        return ("tuple", len(k))
    return (type(k).__name__, None)


KEY_TYPE, KEY_LEN = detect_key_shape(HEADER_FIELD_TO_PACKET_TYPE)


def get_attr(obj, *names, default=None):
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    return default


def pick_packet_class(header):
    """Resolve packet class from the library mapping across common key layouts."""
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
                (fmt, year, ver, pid),
                (fmt, ver, year, pid),
                (year, fmt, ver, pid),
                (year, ver, fmt, pid),
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


def print_packet_overview(packet, label):
    fields = getattr(packet, "_fields_", [])
    if not fields:
        print(f"{label} packet: no _fields_ metadata found")
        return

    names = [name for name, _ctype in fields]
    print(f"{label} packet fields ({len(names)}): {', '.join(names)}")
    sample = []
    for name in names[:12]:
        sample.append(f"{name}={getattr(packet, name, None)}")
    print(f"{label} packet sample: {', '.join(sample)}")


def maybe_print_header(fmt, ver, pid, cls_name, last_header_print):
    now = time.time()
    if PRINT_HEADERS and (now - last_header_print >= HEADER_PRINT_EVERY_SEC):
        # print(f"fmt={fmt} ver={ver} pid={pid:>2} {cls_name}")
        return now
    return last_header_print


def serialize_value(value):
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (bytes, bytearray)):
        return value.decode("ascii", errors="ignore").rstrip("\x00")

    if isinstance(value, ctypes.Array):
        # Char arrays become strings; numeric arrays become lists
        if getattr(value, "_type_", None) in (ctypes.c_char, ctypes.c_ubyte):
            try:
                return bytes(value).decode("ascii", errors="ignore").rstrip("\x00")
            except Exception:
                return list(value)
        return [serialize_value(v) for v in value]

    if hasattr(value, "_fields_"):
        return packet_to_dict(value)

    try:
        return int(value)
    except Exception:
        pass

    try:
        return float(value)
    except Exception:
        pass

    try:
        return str(value)
    except Exception:
        return None


def packet_to_dict(packet):
    fields = getattr(packet, "_fields_", [])
    if not fields:
        return {"raw": str(packet)}

    out = {}
    for name, _ctype in fields:
        try:
            out[name] = serialize_value(getattr(packet, name))
        except Exception:
            out[name] = None
    return out


def get_frame_identifier(header, pkt=None):
    # F1 25 guide: m_frameIdentifier identifies the frame the data was retrieved on.
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


def get_session_time_ms(header, pkt=None):
    # F1 25 guide: m_sessionTime is a float in seconds.
    for obj in (header, pkt):
        if obj is None:
            continue
        for name in ("session_time", "m_sessionTime"):
            if hasattr(obj, name):
                try:
                    return int(float(getattr(obj, name)) * 1000)
                except Exception:
                    pass
    return None


def create_player_and_session():
    global PLAYER_ID, SESSION_ID

    player_res = http.post(f"{API_BASE}/players", json={"name": "python_player"}, timeout=5)
    player_res.raise_for_status()
    PLAYER_ID = player_res.json().get("id") or "python_player"

    session_res = http.post(f"{API_BASE}/sessions", json={"playerId": PLAYER_ID}, timeout=5)
    session_res.raise_for_status()
    SESSION_ID = session_res.json()["id"]

    print("PLAYER ID:", PLAYER_ID)
    print("SESSION ID:", SESSION_ID)


def end_session_once(session_closed):
    if session_closed or not SESSION_ID:
        return True
    try:
        http.post(f"{API_BASE}/sessions/{SESSION_ID}/end", timeout=5)
    except Exception as e:
        print("Session end API error:", e)
    return True


def post_packet_to_api(header, pkt_cls, pkt):
    if not SESSION_ID:
        return

    pid = int(get_attr(header, "packet_id", "m_packetId", default=0) or 0)
    packet_type = pkt_cls.__name__ if pkt_cls else f"Packet{pid}"

    body = {
        "sessionId": SESSION_ID,
        "packetType": packet_type,
        "packetIndex": get_frame_identifier(header, pkt),
        "gameTimeMs": get_session_time_ms(header, pkt),
        "payload": packet_to_dict(pkt) if pkt is not None else {},
    }

    try:
        http.post(f"{API_BASE}/telemetry/packet", json=body, timeout=2)
    except Exception as e:
        print("Packet API error:", e)


def post_telemetry_sample(header, pkt):
    global LAST_SAMPLE_SENT_AT

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

    sample_body = {
        "sessionId": SESSION_ID,
        "timestamp": iso_now(),
        "sampleIndex": get_frame_identifier(header, pkt),
        "speedKph": int(get_attr(t, "speed", "m_speed", default=0) or 0),
        "throttle": float(get_attr(t, "throttle", "m_throttle", default=0.0) or 0.0),
        "brake": float(get_attr(t, "brake", "m_brake", default=0.0) or 0.0),
        "steer": float(get_attr(t, "steer", "m_steer", default=0.0) or 0.0),
        "gear": int(get_attr(t, "gear", "m_gear", default=0) or 0),
        "rpm": int(get_attr(t, "engineRPM", "m_engineRPM", "rpm", default=0) or 0),
        "drs": int(get_attr(t, "drs", "m_drs", default=0) or 0),
        "playerCarIndex": player_idx,
        "payload": packet_to_dict(pkt),
    }

    try:
        http.post(f"{API_BASE}/telemetry/sample", json=sample_body, timeout=2)
        LAST_SAMPLE_SENT_AT = now
    except Exception as e:
        print("Sample API error:", e)


def handle_session_packet(pid, data, pkt_cls, race_active, race_started_at):
    if pid != SESSION_PACKET_ID or pkt_cls is None:
        return race_active, race_started_at

    sess_pkt = pkt_cls.from_buffer_copy(data)
    session_type = int(get_attr(sess_pkt, "session_type", "m_sessionType", default=0) or 0)

    # F1 25 guide: 15 = Race
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

    # F1 25 guide: SSTA = Session Started, SEND = Session Ended
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
    create_player_and_session()
    print(f"Mapping key shape: {KEY_TYPE} len={KEY_LEN}")

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))

    last_header_print = 0.0
    session_packet_printed = False
    race_active = False
    race_started_at = None
    session_closed = False

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "speed_kph", "throttle", "brake", "steer", "gear", "rpm", "drs", "player_car_index"])

        print("Listening... (CTRL+C to stop)")

        try:
            while True:
                data, addr = sock.recvfrom(4096)

                try:
                    header = PacketHeader.from_buffer_copy(data)
                except Exception:
                    continue

                fmt = int(get_attr(header, "packet_format", "m_packetFormat", default=0) or 0)
                ver = int(get_attr(header, "packet_version", "m_packetVersion", default=0) or 0)
                pid = int(get_attr(header, "packet_id", "m_packetId", default=0) or 0)
                player_idx = int(get_attr(header, "player_car_index", "m_playerCarIndex", default=0) or 0)

                pkt_cls = pick_packet_class(header)
                cls_name = pkt_cls.__name__ if pkt_cls else "UnknownPacket"
                last_header_print = maybe_print_header(fmt, ver, pid, cls_name, last_header_print)

                pkt = None
                if pkt_cls is not None:
                    try:
                        pkt = pkt_cls.from_buffer_copy(data)
                    except Exception:
                        pkt = None

                # Print first session packet for debugging the schema
                if pid == SESSION_PACKET_ID and pkt is not None and not session_packet_printed:
                    print_packet_overview(pkt, "Session")
                    session_packet_printed = True

                # Session state tracking stays the same
                race_active, race_started_at = handle_session_packet(pid, data, pkt_cls, race_active, race_started_at)
                race_active, race_started_at = handle_event_packet(pid, data, pkt_cls, race_active, race_started_at)
                race_active, race_started_at = handle_final_class_packet(pid, race_active, race_started_at)

                # Send every recognized packet to the generic packet endpoint.
                # This covers Motion, Session, Lap Data, Event, Participants,
                # Car Setups, Car Telemetry, Car Status, Final Classification,
                # Lobby Info, Car Damage, Session History, Tyre Sets, Motion Ex,
                # Time Trial, and Lap Positions.
                if pid in IMPORTANT_PACKET_IDS and pkt_cls is not None:
                    post_packet_to_api(header, pkt_cls, pkt)

                # Rich sample endpoint for packet 6 (Car Telemetry)
                if pid == TELEMETRY_PACKET_ID and pkt is not None:
                    post_telemetry_sample(header, pkt)

                    # Optional local CSV mirror
                    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData")
                    if arr is not None and len(arr) > 0:
                        idx = player_idx if 0 <= player_idx < len(arr) else 0
                        t = arr[idx]
                        w.writerow([
                            iso_now(),
                            int(get_attr(t, "speed", "m_speed", default=0) or 0),
                            float(get_attr(t, "throttle", "m_throttle", default=0.0) or 0.0),
                            float(get_attr(t, "brake", "m_brake", default=0.0) or 0.0),
                            float(get_attr(t, "steer", "m_steer", default=0.0) or 0.0),
                            int(get_attr(t, "gear", "m_gear", default=0) or 0),
                            int(get_attr(t, "engineRPM", "m_engineRPM", "rpm", default=0) or 0),
                            int(get_attr(t, "drs", "m_drs", default=0) or 0),
                            player_idx,
                        ])
                        f.flush()

        except KeyboardInterrupt:
            print("\nStopped. CSV saved:", CSV_PATH)
        finally:
            session_closed = end_session_once(session_closed)
            sock.close()


if __name__ == "__main__":
    main()

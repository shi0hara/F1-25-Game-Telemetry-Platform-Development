import socket
import time
import csv
from datetime import datetime

from f1.packets import PacketHeader, HEADER_FIELD_TO_PACKET_TYPE

UDP_IP = "0.0.0.0"
UDP_PORT = 20777
CSV_PATH = "telemetry_live.csv"

PRINT_HEADERS = True          # set False if too spammy
HEADER_PRINT_EVERY_SEC = 0.5  # print a FROM line every 0.5s
TELEMETRY_PACKET_ID = 6       # car telemetry
SESSION_PACKET_ID = 1         # session data
EVENT_PACKET_ID = 3           # event data
FINAL_CLASS_PACKET_ID = 8     # final classification (race end)
RACE_SESSION_TYPES = {10, 11, 12, 15}  # race-like session types across game modes/versions
MIN_EVENT_END_AFTER_START_SEC = 10.0  # ignore early SEND events right after start

# Inspects the HEADER_FIELD_TO_PACKET_TYPE mapping to determine whether its keys
# are plain integers, tuples, or another type, and returns the key type and length.
def detect_key_shape(mapping):
    k = next(iter(mapping.keys()))
    if isinstance(k, int):
        return ("int", 1)
    if isinstance(k, tuple):
        return ("tuple", len(k))
    return (type(k).__name__, None)

KEY_TYPE, KEY_LEN = detect_key_shape(HEADER_FIELD_TO_PACKET_TYPE)

# Given a parsed PacketHeader, looks up and returns the correct packet class
# from HEADER_FIELD_TO_PACKET_TYPE by trying common key layouts (int, 2-tuple,
# 3-tuple, 4-tuple). Falls back to a best-score brute-force search if no
# exact key match is found.
def pick_packet_class(header):
    fmt = int(header.packet_format)
    ver = int(header.packet_version)
    pid = int(header.packet_id)
    year = int(getattr(header, "game_year", 0))

    m = HEADER_FIELD_TO_PACKET_TYPE

    if KEY_TYPE == "int":
        return m.get(pid)

    # Try common tuple key layouts
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

        # Brute-force fallback
        best_cls = None
        best_score = -1
        for k, cls in m.items():
            if not isinstance(k, tuple):
                continue
            if pid not in k:
                continue
            score = 0
            if fmt in k: score += 3
            if ver in k: score += 2
            if year in k: score += 1
            if score > best_score:
                best_score = score
                best_cls = cls
        return best_cls

    return None

# Returns the value of the first attribute in `names` that exists on `obj`.
# If none of the attributes are found, returns `default`.
def get_attr(obj, *names, default=None):
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    return default

# Extracts the event string code from an event packet, handling different
# field names and data types (bytes, str, ctypes char arrays) used across
# game versions and library variants. Returns a clean ASCII string.
def extract_event_code(event_pkt):
    # Different library/game versions expose this with different field names/types.
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

    # ctypes char arrays often need conversion to bytes first
    try:
        return bytes(raw).decode("ascii", errors="ignore").strip("\x00 ")
    except Exception:
        return str(raw).strip("\x00 ")

# Prints a diagnostic summary of a packet's field names and the first 12
# field values to the console, useful for inspecting unknown packet layouts.
def print_packet_overview(packet, label):
    fields = getattr(packet, "_fields_", [])
    if not fields:
        print(f"{label} packet: no _fields_ metadata found")
        return

    names = [name for name, _ctype in fields]
    print(f"{label} packet fields ({len(names)}): {', '.join(names)}")

    sample = []
    for name in names[:12]:
        value = getattr(packet, name, None)
        sample.append(f"{name}={value}")
    print(f"{label} packet sample: {', '.join(sample)}")

# Rate-limits console output of packet header info to once every
# HEADER_PRINT_EVERY_SEC seconds. Returns the updated timestamp of the
# last print, or the original value if no print occurred.
def maybe_print_header(addr, fmt, ver, pid, cls_name, last_header_print):
    now = time.time()
    if PRINT_HEADERS and (now - last_header_print >= HEADER_PRINT_EVERY_SEC):
        # print(f"FROM {addr} | fmt={fmt} ver={ver} pid={pid:>2} {cls_name}")
        return now
    return last_header_print

# Processes a session packet to detect when a race-like session starts or ends.
# Updates and returns the race_active flag and the timestamp when the race started.
def handle_session_packet(pid, data, pkt_cls, race_active, race_started_at):
    if pid != SESSION_PACKET_ID or pkt_cls is None:
        return race_active, race_started_at

    sess_pkt = pkt_cls.from_buffer_copy(data)
    session_type = int(get_attr(sess_pkt, "session_type", "m_sessionType", default=0))
    is_race_session = session_type in RACE_SESSION_TYPES
    if is_race_session and not race_active:
        print("Grand Prix session started.")
        return True, time.time()
    if not is_race_session and race_active:
        print("Grand Prix session ended.")
        return False, None
    return race_active, race_started_at

# Processes an event packet and checks for a session-end (SEND) event code.
# Ignores SEND events that arrive too soon after the session started to avoid
# false positives during session transitions. Returns updated race state.
def handle_event_packet(pid, data, pkt_cls, race_active, race_started_at):
    if pid != EVENT_PACKET_ID or pkt_cls is None:
        return race_active, race_started_at

    event_pkt = pkt_cls.from_buffer_copy(data)
    code = extract_event_code(event_pkt)
    # Do not start race from SSTA alone; it can fire for non-race sessions.
    if code == "SEND" and race_active:
        # Some flows emit SEND immediately after SSTA during transitions.
        if race_started_at is not None and (time.time() - race_started_at) < MIN_EVENT_END_AFTER_START_SEC:
            return race_active, race_started_at
        print("Grand Prix session ended.")
        return False, None
    return race_active, race_started_at

# Checks whether the incoming packet is a final classification packet (race end).
# If so and a race is currently active, marks the race as ended.
# Returns the updated race_active flag and race_started_at timestamp.
def handle_final_class_packet(pid, race_active, race_started_at):
    if pid == FINAL_CLASS_PACKET_ID and race_active:
        print("Grand Prix session ended.")
        return False, None
    return race_active, race_started_at

# Parses a car telemetry packet and writes the player car's data (speed, throttle,
# brake, steer, gear, RPM, DRS) along with a timestamp to the CSV file.
# Also prints a live summary line to the console for debugging.
def handle_telemetry_packet(pid, data, pkt_cls, player_idx, writer, csv_file):
    if pid != TELEMETRY_PACKET_ID or pkt_cls is None:
        return

    pkt = pkt_cls.from_buffer_copy(data)

    arr = get_attr(pkt, "car_telemetry_data", "m_carTelemetryData")
    if arr is None or len(arr) == 0:
        return

    idx = player_idx if 0 <= player_idx < len(arr) else 0
    t = arr[idx]

    speed = int(get_attr(t, "speed", "m_speed", default=0))
    throttle = float(get_attr(t, "throttle", "m_throttle", default=0.0))
    brake = float(get_attr(t, "brake", "m_brake", default=0.0))
    steer = float(get_attr(t, "steer", "m_steer", default=0.0))
    gear = int(get_attr(t, "gear", "m_gear", default=0))
    rpm = int(get_attr(t, "engine_rpm", "m_engineRPM", default=0))
    drs = int(get_attr(t, "drs", "m_drs", default=0))

    ts = datetime.now().isoformat(timespec="milliseconds")

    # For debugging: print live telemetry to console
    print(f"  LIVE | car={idx} | speed={speed} | thr={throttle:.2f} | brk={brake:.2f} | gear={gear} | rpm={rpm} | drs={drs}")

    writer.writerow([ts, speed, throttle, brake, steer, gear, rpm, drs, idx])
    csv_file.flush()

# Entry point. Opens a UDP socket on the configured port, creates the CSV output
# file with headers, and enters a loop that receives F1 telemetry packets,
# dispatches them to the appropriate handlers, and writes car telemetry data
# to disk. Stops cleanly on CTRL+C.
def main():
    print(f"Mapping key shape: {KEY_TYPE} len={KEY_LEN}")

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))

    last_header_print = 0.0

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["timestamp","speed_kph","throttle","brake","steer","gear","rpm","drs","player_car_index"])

        print("Listening... (CTRL+C to stop)")

        race_active = False
        race_started_at = None
        session_packet_printed = False

        try:
            while True:
                data, addr = sock.recvfrom(4096)

                header = PacketHeader.from_buffer_copy(data)
                fmt = int(header.packet_format)
                ver = int(header.packet_version)
                pid = int(header.packet_id)
                player_idx = int(header.player_car_index)

                pkt_cls = pick_packet_class(header)
                cls_name = pkt_cls.__name__ if pkt_cls else "UnknownPacket"

                last_header_print = maybe_print_header(addr, fmt, ver, pid, cls_name, last_header_print)

                if pid == SESSION_PACKET_ID and pkt_cls is not None and not session_packet_printed:
                    sess_pkt = pkt_cls.from_buffer_copy(data)
                    print_packet_overview(sess_pkt, "Session")
                    session_packet_printed = True

                race_active, race_started_at = handle_session_packet(pid, data, pkt_cls, race_active, race_started_at)
                race_active, race_started_at = handle_event_packet(pid, data, pkt_cls, race_active, race_started_at)
                race_active, race_started_at = handle_final_class_packet(pid, race_active, race_started_at)

                handle_telemetry_packet(pid, data, pkt_cls, player_idx, w, f)

        except KeyboardInterrupt:
            print("\nStopped. CSV saved:", CSV_PATH)
        finally:
            sock.close()

if __name__ == "__main__":
    main()

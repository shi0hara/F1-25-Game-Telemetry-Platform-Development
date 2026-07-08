import argparse
import csv
import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path


DEFAULT_INPUT = "telemetry_live.csv"
DEFAULT_MARKDOWN_OUTPUT = "post_session_ai_report.md"
DEFAULT_JSON_OUTPUT = "post_session_ai_report.json"


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
    speeds = [sample["speedKph"] for sample in run]
    brakes = [sample["brake"] for sample in run]
    throttles = [sample["throttle"] for sample in run]
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


def summarize_lap(lap_number, samples):
    speeds = [sample["speedKph"] for sample in samples]
    throttles = [sample["throttle"] for sample in samples]
    brakes = [sample["brake"] for sample in samples]
    steerings = [sample["steering"] for sample in samples]
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
        "bestDeltaToPbMs": min(deltas) if deltas else None,
        "finalDeltaToPbMs": deltas[-1] if deltas else None,
        "brakingZoneCount": len(braking_runs),
        "corneringZoneCount": len(corner_runs),
        "brakingZones": [summarize_segment(run) for run in braking_runs[:12]],
        "corneringZones": [summarize_segment(run) for run in corner_runs[:12]],
    }


def summarize_session(samples):
    by_lap = defaultdict(list)
    for sample in samples:
        by_lap[sample["lapNumber"]].append(sample)

    lap_summaries = [
        summarize_lap(lap_number, by_lap[lap_number])
        for lap_number in sorted(by_lap)
    ]

    speeds = [sample["speedKph"] for sample in samples]
    lap_durations = [lap["approxDurationSec"] for lap in lap_summaries if lap["approxDurationSec"]]

    session = {
        "sampleCount": len(samples),
        "lapCount": len(lap_summaries),
        "firstTimestamp": samples[0]["timestampRaw"] if samples else None,
        "lastTimestamp": samples[-1]["timestampRaw"] if samples else None,
        "approxDurationSec": duration_seconds(samples),
        "avgSpeedKph": avg(speeds),
        "maxSpeedKph": max(speeds) if speeds else None,
        "lapDurationMedianSec": median(lap_durations),
        "lapDurationSpreadSec": (max(lap_durations) - min(lap_durations)) if len(lap_durations) >= 2 else None,
    }

    return {
        "schema": "f1-post-session-ai-report-v1",
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "session": session,
        "laps": lap_summaries,
        "coachSignals": build_coach_signals(lap_summaries),
    }


def build_coach_signals(laps):
    signals = []

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
            format_time(lap["approxDurationSec"]),
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
        f"- Laps detected: {session['lapCount']}",
        f"- Approx session duration: {format_time(session['approxDurationSec'])}",
        f"- Average speed: {format_number(session['avgSpeedKph'], 1, ' kph')}",
        f"- Top speed: {format_number(session['maxSpeedKph'], 0, ' kph')}",
        f"- Lap duration spread: {format_number(session['lapDurationSpreadSec'], 2, ' sec')}",
        "",
        "## How To Coach From This File",
        "",
        "- Prioritize high severity coach signals first.",
        "- Compare laps against each other, not against a generic ideal lap.",
        "- Look for patterns: long coasting, throttle/brake overlap, low full-throttle percentage, and heavy braking time.",
        "- Give specific, actionable tips: where to brake, where to release brake, when to commit to throttle, and how to smooth steering.",
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
    ]

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
            f"- Approx duration: {format_time(lap['approxDurationSec'])}",
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
            "",
        ])

        if lap["brakingZones"]:
            rows = []
            for index, zone in enumerate(lap["brakingZones"], start=1):
                rows.append([
                    index,
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
                    ["#", "Start", "End", "Distance", "Entry", "Min", "Exit", "Peak brake"],
                    rows,
                ),
                "",
            ])

        if lap["corneringZones"]:
            rows = []
            for index, zone in enumerate(lap["corneringZones"], start=1):
                rows.append([
                    index,
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
                    ["#", "Start", "End", "Avg speed", "Min speed", "Avg throttle", "Peak steering"],
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


def main():
    parser = argparse.ArgumentParser(description="Build an AI-friendly F1 post-session telemetry report.")
    parser.add_argument("--csv", default=DEFAULT_INPUT, help="Input telemetry CSV path.")
    parser.add_argument("--md", default=DEFAULT_MARKDOWN_OUTPUT, help="Output Markdown report path.")
    parser.add_argument("--json", default=DEFAULT_JSON_OUTPUT, help="Output JSON report path.")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise SystemExit(f"Input CSV not found: {csv_path}")

    samples = load_samples(csv_path)
    if not samples:
        raise SystemExit("No usable telemetry samples found in the CSV.")

    report = summarize_session(samples)

    markdown_path = Path(args.md)
    json_path = Path(args.json)

    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    json_path.write_text(json.dumps(make_json_safe(report), indent=2), encoding="utf-8")

    print(f"Wrote {markdown_path}")
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    main()

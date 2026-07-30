/**
 * lapResetTrim.js — Lap Reset Detection & Trail Trimming
 * ========================================================
 * When a lap resets (e.g., the driver crosses the start/finish line or
 * flashbacks/rewinds), the lapDistance value suddenly drops back to near zero.
 * 
 * This utility:
 * 1. Detects these "lap resets" by looking for large backward jumps in distance
 * 2. Trims any duplicate/future-lap points that would cause the telemetry trail
 *    to visually loop back on itself on the track map
 * 
 * Without this, the map trail would show ghost traces from the next lap
 * overlapping the current lap's data.
 */

const DEFAULT_RESET_DROP_METERS = 25;  // Distance drop threshold to detect a lap reset
const DEFAULT_TRIM_MARGIN_METERS = 2;  // Extra margin when trimming duplicate points

function hasNumber(value) {
  return Number.isFinite(Number(value));
}

function readNumber(...values) {
  for (const value of values) {
    if (hasNumber(value)) return Number(value);
  }
  return null;
}

function readTimestampMs(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000);
  }
  if (typeof value._seconds === "number") {
    return value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1000000);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLapNumber(value, fallback = null) {
  if (hasNumber(value)) return Number(value);

  const text = String(value ?? "");
  const lapMatch = text.match(/lap\D*(\d+)/i);
  if (lapMatch) return Number(lapMatch[1]);

  const firstNumber = text.match(/\d+/);
  return firstNumber ? Number(firstNumber[0]) : fallback;
}

export function getLapNumberFromSample(sample, fallback = null) {
  return parseLapNumber(sample?.lapNumber ?? sample?.lap, fallback);
}

export function getLapDistanceFromSample(sample) {
  return readNumber(sample?.lapDistance, sample?.distanceM, sample?.d);
}

export function isLapDistanceReset(previous, current, options = {}) {
  if (!previous || !current) return false;

  const previousLap = getLapNumberFromSample(previous, null);
  const currentLap = getLapNumberFromSample(current, null);

  if (previousLap !== null && currentLap !== null && previousLap !== currentLap) {
    return false;
  }

  if (previousLap === null && currentLap === null) {
    return false;
  }

  const previousDistance = getLapDistanceFromSample(previous);
  const currentDistance = getLapDistanceFromSample(current);

  if (previousDistance === null || currentDistance === null) return false;

  const resetDropMeters = Number.isFinite(Number(options.resetDropMeters))
    ? Number(options.resetDropMeters)
    : DEFAULT_RESET_DROP_METERS;

  return currentDistance + resetDropMeters < previousDistance;
}

function compareStreamOrder(a, b) {
  const aSampleIndex = readNumber(a.point?.sampleIndex, a.point?.i);
  const bSampleIndex = readNumber(b.point?.sampleIndex, b.point?.i);

  if (aSampleIndex !== null && bSampleIndex !== null && aSampleIndex !== bSampleIndex) {
    return aSampleIndex - bSampleIndex;
  }

  const aTimestamp = readTimestampMs(a.point?.timestamp ?? a.point?.t);
  const bTimestamp = readTimestampMs(b.point?.timestamp ?? b.point?.t);

  if (aTimestamp !== null && bTimestamp !== null && aTimestamp !== bTimestamp) {
    return aTimestamp - bTimestamp;
  }

  return a.index - b.index;
}

export function trimFutureLapPointsOnReset(points, options = {}) {
  if (!Array.isArray(points) || points.length < 2) return points || [];

  const trimMarginMeters = Number.isFinite(Number(options.trimMarginMeters))
    ? Number(options.trimMarginMeters)
    : DEFAULT_TRIM_MARGIN_METERS;
  const ordered = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point && typeof point === "object")
    .sort(compareStreamOrder);
  const kept = [];

  for (const entry of ordered) {
    const point = entry.point;
    const previous = kept[kept.length - 1]?.point;

    if (previous && isLapDistanceReset(previous, point, options)) {
      const resetLap =
        getLapNumberFromSample(point, null) ??
        getLapNumberFromSample(previous, null);
      const resetDistance = getLapDistanceFromSample(point);

      if (resetDistance !== null) {
        for (let i = kept.length - 1; i >= 0; i -= 1) {
          const keptPoint = kept[i].point;
          const keptLap = getLapNumberFromSample(keptPoint, resetLap);

          if (resetLap !== null && keptLap !== null && keptLap !== resetLap) {
            continue;
          }

          const keptDistance = getLapDistanceFromSample(keptPoint);
          if (keptDistance !== null && keptDistance >= resetDistance - trimMarginMeters) {
            kept.splice(i, 1);
          }
        }
      }
    }

    kept.push(entry);
  }

  return kept.map(({ point }) => point);
}

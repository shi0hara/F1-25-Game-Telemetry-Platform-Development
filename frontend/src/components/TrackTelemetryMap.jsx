import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  isLapDistanceReset,
  trimFutureLapPointsOnReset,
} from "../utils/lapResetTrim";
import { normalizeTrackMapImageUrl } from "../utils/mapImages";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hasNumber(value) {
  return Number.isFinite(Number(value));
}

function num(value) {
  return Number(value);
}

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function readControlFraction(sample, pctKey, rawKey) {
  const pctValue = Number(sample?.[pctKey]);
  if (Number.isFinite(pctValue)) {
    return clamp(pctValue > 1 ? pctValue / 100 : pctValue, 0, 1);
  }

  return clamp(sample?.[rawKey], 0, 1);
}

function getTelemetryColor(sample) {
  const brake = readControlFraction(sample, "brakePct", "brake");
  const throttle = readControlFraction(sample, "throttlePct", "throttle");
  const steering = Math.abs(clamp(sample?.steering, -1, 1));

  if (brake > 0.05) {
    const r = Math.round(140 + brake * 115);
    return `rgb(${r}, 35, 35)`;
  }

  if (throttle > 0.05) {
    const g = Math.round(120 + throttle * 135);
    return `rgb(35, ${g}, 75)`;
  }

  if (steering > 0.2) {
    const b = Math.round(140 + steering * 115);
    return `rgb(45, 130, ${b})`;
  }

  return "rgb(160, 160, 160)";
}

function invert3x3(m) {
  const a = m[0][0];
  const b = m[0][1];
  const c = m[0][2];

  const d = m[1][0];
  const e = m[1][1];
  const f = m[1][2];

  const g = m[2][0];
  const h = m[2][1];
  const i = m[2][2];

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;

  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);

  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;

  if (Math.abs(det) < 0.000000001) {
    return null;
  }

  return [
    [A / det, D / det, G / det],
    [B / det, E / det, H / det],
    [C / det, F / det, I / det],
  ];
}

function multiplyMatrixVector(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function solveLeastSquaresAffine(anchorPoints) {
  const points = Array.isArray(anchorPoints)
    ? anchorPoints.filter((point) => {
        return (
          hasNumber(point.worldX) &&
          hasNumber(point.worldZ) &&
          hasNumber(point.imageX) &&
          hasNumber(point.imageY)
        );
      })
    : [];

  if (points.length < 3) {
    return null;
  }

  let sumXX = 0;
  let sumXZ = 0;
  let sumX = 0;

  let sumZZ = 0;
  let sumZ = 0;
  let n = points.length;

  let sumImageXWorldX = 0;
  let sumImageXWorldZ = 0;
  let sumImageX = 0;

  let sumImageYWorldX = 0;
  let sumImageYWorldZ = 0;
  let sumImageY = 0;

  for (const point of points) {
    const worldX = num(point.worldX);
    const worldZ = num(point.worldZ);
    const imageX = num(point.imageX);
    const imageY = num(point.imageY);

    sumXX += worldX * worldX;
    sumXZ += worldX * worldZ;
    sumX += worldX;

    sumZZ += worldZ * worldZ;
    sumZ += worldZ;

    sumImageXWorldX += imageX * worldX;
    sumImageXWorldZ += imageX * worldZ;
    sumImageX += imageX;

    sumImageYWorldX += imageY * worldX;
    sumImageYWorldZ += imageY * worldZ;
    sumImageY += imageY;
  }

  const normalMatrix = [
    [sumXX, sumXZ, sumX],
    [sumXZ, sumZZ, sumZ],
    [sumX, sumZ, n],
  ];

  const inverse = invert3x3(normalMatrix);

  if (!inverse) {
    return null;
  }

  const imageXCoefficients = multiplyMatrixVector(inverse, [
    sumImageXWorldX,
    sumImageXWorldZ,
    sumImageX,
  ]);

  const imageYCoefficients = multiplyMatrixVector(inverse, [
    sumImageYWorldX,
    sumImageYWorldZ,
    sumImageY,
  ]);

  const transform = {
    anchorCount: points.length,

    worldToImage(worldX, worldZ) {
      const x = num(worldX);
      const z = num(worldZ);

      return {
        x:
          imageXCoefficients[0] * x +
          imageXCoefficients[1] * z +
          imageXCoefficients[2],
        y:
          imageYCoefficients[0] * x +
          imageYCoefficients[1] * z +
          imageYCoefficients[2],
      };
    },
  };

  let totalErrorSquared = 0;

  for (const point of points) {
    const predicted = transform.worldToImage(point.worldX, point.worldZ);
    const dx = predicted.x - num(point.imageX);
    const dy = predicted.y - num(point.imageY);

    totalErrorSquared += dx * dx + dy * dy;
  }

  transform.rmsePixels = Math.sqrt(totalErrorSquared / points.length);

  return transform;
}

function solveBoundsTransform(worldBounds, imageWidth, imageHeight) {
  if (!worldBounds) return null;

  const minX = num(worldBounds.minX);
  const maxX = num(worldBounds.maxX);
  const minZ = num(worldBounds.minZ);
  const maxZ = num(worldBounds.maxZ);

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  if (maxX === minX || maxZ === minZ) return null;

  return {
    anchorCount: 0,
    rmsePixels: null,

    worldToImage(worldX, worldZ) {
      const xNorm = (num(worldX) - minX) / (maxX - minX);
      const zNorm = (num(worldZ) - minZ) / (maxZ - minZ);

      return {
        x: (1 - xNorm) * imageWidth,
        y: (1 - zNorm) * imageHeight,
      };
    },
  };
}

function drawTextBadge(ctx, text, x, y) {
  ctx.font = "14px Arial";

  const paddingX = 8;
  const paddingY = 5;
  const metrics = ctx.measureText(text);
  const width = metrics.width + paddingX * 2;
  const height = 24;

  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(x, y - height, width, height);

  ctx.fillStyle = "white";
  ctx.fillText(text, x + paddingX, y - paddingY);
}

const MAP_TELEPORT_JUMP_METERS = 180;
const LIVE_MAP_FETCH_INTERVAL_MS = 150;
const LIVE_MAP_VISUAL_LERP = 1;
const LIVE_MAP_TRAIL_UI_UPDATE_MS = 80;

function worldDistanceMeters(a, b) {
  if (!a || !b || !hasNumber(a.worldX) || !hasNumber(a.worldZ) || !hasNumber(b.worldX) || !hasNumber(b.worldZ)) {
    return 0;
  }

  const dx = Number(a.worldX) - Number(b.worldX);
  const dz = Number(a.worldZ) - Number(b.worldZ);
  return Math.sqrt(dx * dx + dz * dz);
}

function isPitMapSample(sample) {
  return hasNumber(sample?.pitStatus) && Number(sample.pitStatus) > 0;
}

function isTeleportJump(previous, current) {
  if (!previous || !current) return false;
  if (isPitMapSample(previous) || isPitMapSample(current)) return true;

  const previousLap = getLapNumber(previous, null);
  const currentLap = getLapNumber(current, null);
  if (previousLap !== null && currentLap !== null && previousLap !== currentLap) {
    return false;
  }

  if (worldDistanceMeters(previous, current) >= MAP_TELEPORT_JUMP_METERS) {
    return true;
  }

  if (isLapDistanceReset(previous, current)) {
    return true;
  }

  return false;
}


function getTrailPoints(trail, transform) {
  return trail
    .filter((sample) => hasNumber(sample.worldX) && hasNumber(sample.worldZ))
    .map((sample) => {
      const pos = transform.worldToImage(sample.worldX, sample.worldZ);

      return {
        x: pos.x,
        y: pos.y,
        sample,
      };
    })
    .filter((point) => {
      return Number.isFinite(point.x) && Number.isFinite(point.y);
    });
}

function drawTrailSegment(ctx, previous, current, next, color) {
  const mid1 = {
    x: (previous.x + current.x) / 2,
    y: (previous.y + current.y) / 2,
  };

  const mid2 = {
    x: (current.x + next.x) / 2,
    y: (current.y + next.y) / 2,
  };

  ctx.beginPath();
  ctx.moveTo(mid1.x, mid1.y);
  ctx.quadraticCurveTo(current.x, current.y, mid2.x, mid2.y);
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawColoredLine(ctx, from, to, color) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = color;
  ctx.stroke();
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function drawSmoothTelemetryTrail(ctx, trail, transform) {
  const points = getTrailPoints(
    trail.filter((sample) => !isPitMapSample(sample)),
    transform
  );

  if (points.length < 2) return;

  ctx.save();

  ctx.lineWidth = 5;
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const continuousSegments = [];
  let segment = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];

    if (current.sample?.segmentBreakBefore || isTeleportJump(previous.sample, current.sample)) {
      if (segment.length > 1) continuousSegments.push(segment);
      segment = [current];
    } else {
      segment.push(current);
    }
  }

  if (segment.length > 1) continuousSegments.push(segment);

  for (const pointsForSegment of continuousSegments) {
    if (pointsForSegment.length === 2) {
      drawColoredLine(
        ctx,
        pointsForSegment[0],
        pointsForSegment[1],
        getTelemetryColor(pointsForSegment[1].sample)
      );
      continue;
    }

    drawColoredLine(
      ctx,
      pointsForSegment[0],
      midpoint(pointsForSegment[0], pointsForSegment[1]),
      getTelemetryColor(pointsForSegment[1].sample)
    );

    for (let i = 1; i < pointsForSegment.length - 1; i++) {
      drawTrailSegment(
        ctx,
        pointsForSegment[i - 1],
        pointsForSegment[i],
        pointsForSegment[i + 1],
        getTelemetryColor(pointsForSegment[i].sample)
      );
    }

    const lastIndex = pointsForSegment.length - 1;
    drawColoredLine(
      ctx,
      midpoint(pointsForSegment[lastIndex - 1], pointsForSegment[lastIndex]),
      pointsForSegment[lastIndex],
      getTelemetryColor(pointsForSegment[lastIndex].sample)
    );
  }

  ctx.restore();
}

function getVisualLivePoint(visualPointRef, latest) {
  if (!latest || !hasNumber(latest.worldX) || !hasNumber(latest.worldZ)) {
    return latest;
  }

  const current = visualPointRef.current;

  if (
    !current ||
    isTeleportJump(current, latest) ||
    worldDistanceMeters(current, latest) > 65
  ) {
    visualPointRef.current = latest;
    return latest;
  }

  const visualPoint = {
    ...latest,
    worldX:
      Number(current.worldX) +
      (Number(latest.worldX) - Number(current.worldX)) * LIVE_MAP_VISUAL_LERP,
    worldZ:
      Number(current.worldZ) +
      (Number(latest.worldZ) - Number(current.worldZ)) * LIVE_MAP_VISUAL_LERP,
  };

  visualPointRef.current = visualPoint;
  return visualPoint;
}

function parseLapNumber(value, fallback = null) {
  if (hasNumber(value)) return Number(value);

  const text = String(value ?? "");
  const lapMatch = text.match(/lap\D*(\d+)/i);
  if (lapMatch) return Number(lapMatch[1]);

  const firstNumber = text.match(/\d+/);
  return firstNumber ? Number(firstNumber[0]) : fallback;
}

function getLapNumber(sample, fallback = null) {
  return parseLapNumber(sample?.lapNumber, fallback);
}

function getLapTrailKey(lapNumber) {
  return `lap-${lapNumber}`;
}

function getLapTrailLabel(lapNumber) {
  return `Lap ${lapNumber} Trail`;
}

function isSameMapPosition(a, b) {
  return (
    a &&
    b &&
    Number(a.worldX).toFixed(3) === Number(b.worldX).toFixed(3) &&
    Number(a.worldZ).toFixed(3) === Number(b.worldZ).toFixed(3)
  );
}

function mapPointTimestampMs(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function readMapPointFreshness(point) {
  if (!point || typeof point !== "object") {
    return {
      sampleIndex: null,
      lapNumber: null,
      lapDistance: null,
      timestampMs: null,
    };
  }

  return {
    sampleIndex: hasNumber(point.sampleIndex ?? point.i)
      ? Number(point.sampleIndex ?? point.i)
      : null,
    lapNumber: getLapNumber(point, null),
    lapDistance: hasNumber(point.lapDistance ?? point.d)
      ? Number(point.lapDistance ?? point.d)
      : null,
    timestampMs: mapPointTimestampMs(point.timestamp ?? point.t),
  };
}

function compareMapPointFreshness(next, prev) {
  if (!prev) return 1;

  for (const key of ["sampleIndex", "timestampMs"]) {
    if (next[key] !== null && prev[key] !== null) {
      const diff = next[key] - prev[key];
      if (diff !== 0) return diff;
    }
  }

  if (
    next.lapNumber !== null &&
    prev.lapNumber !== null &&
    next.lapNumber !== prev.lapNumber
  ) {
    return next.lapNumber - prev.lapNumber;
  }

  if (
    next.lapDistance !== null &&
    prev.lapDistance !== null &&
    next.lapDistance !== prev.lapDistance
  ) {
    return next.lapDistance - prev.lapDistance;
  }

  return 0;
}

function readCenterlinePoint(point) {
  const worldX = point.x ?? point.worldX;
  const worldZ = point.z ?? point.worldZ;

  if (!hasNumber(worldX) || !hasNumber(worldZ)) return null;

  return {
    worldX: num(worldX),
    worldZ: num(worldZ),
  };
}

function readStoredMapPoint(sample) {
  if (!sample || typeof sample !== "object") return null;

  const mapPosition = sample.mapPosition || {};
  const worldX = sample.worldX ?? mapPosition.worldX ?? sample.x;
  const worldY = sample.worldY ?? mapPosition.worldY ?? sample.y;
  const worldZ = sample.worldZ ?? mapPosition.worldZ ?? sample.z;
  const fallbackLap = hasNumber(sample.lap) ? Number(sample.lap) : null;

  if (!hasNumber(worldX) || !hasNumber(worldZ)) return null;

  return {
    timestamp: sample.timestamp ?? sample.t ?? null,
    sampleIndex: hasNumber(sample.sampleIndex ?? sample.i)
      ? Number(sample.sampleIndex ?? sample.i)
      : null,
    lapNumber: getLapNumber(sample, fallbackLap),
    lapDistance: hasNumber(sample.lapDistance ?? sample.d)
      ? Number(sample.lapDistance ?? sample.d)
      : null,
    totalDistance: hasNumber(sample.totalDistance)
      ? Number(sample.totalDistance)
      : null,
    worldX: Number(worldX),
    worldY: hasNumber(worldY) ? Number(worldY) : null,
    worldZ: Number(worldZ),
    speedKph: hasNumber(sample.speedKph ?? sample.v)
      ? Number(sample.speedKph ?? sample.v)
      : null,
    throttle: hasNumber(sample.throttle ?? sample.th)
      ? Number(sample.throttle ?? sample.th)
      : null,
    brake: hasNumber(sample.brake ?? sample.br)
      ? Number(sample.brake ?? sample.br)
      : null,
    steering: hasNumber(sample.steering ?? sample.st)
      ? Number(sample.steering ?? sample.st)
      : null,
    pitStatus: hasNumber(sample.pitStatus ?? sample.pit)
      ? Number(sample.pitStatus ?? sample.pit)
      : null,
  };
}

function normalizeTrailPoints(points) {
  const trimmed = trimFutureLapPointsOnReset(
    (points || []).filter((point) => point && !isPitMapSample(point))
  );
  const sorted = [...trimmed].sort(compareMapPoints);
  const next = [];

  for (const point of sorted) {
    const previous = next[next.length - 1];
    const previousDistance = Number(previous?.lapDistance);
    const pointDistance = Number(point.lapDistance);
    const nearlySameDistance =
      Number.isFinite(previousDistance) &&
      Number.isFinite(pointDistance) &&
      Math.abs(previousDistance - pointDistance) < 0.5;

    if (previous && nearlySameDistance && isSameMapPosition(previous, point)) {
      next[next.length - 1] = point;
      continue;
    }

    next.push(point);
  }

  return next;
}

function normalizeLapTrailsFromApi(lapTrails, maxPointsPerLap = 900) {
  if (!Array.isArray(lapTrails)) return [];

  const byLap = new Map();

  for (const trail of lapTrails) {
    const points = Array.isArray(trail?.points)
      ? trail.points.map(readStoredMapPoint).filter(Boolean)
      : [];
    const lapNumber =
      getLapNumber(trail, null) ??
      parseLapNumber(trail?.key, null) ??
      parseLapNumber(trail?.label, null) ??
      getLapNumber(points[0], null);

    if (lapNumber == null || points.length < 2) continue;

    const key = getLapTrailKey(lapNumber);
    const existing = byLap.get(key);
    const partPoints = points.map((point) => ({
      ...point,
      segmentBreakBefore: Boolean(point.segmentBreakBefore),
    }));

    if (!existing) {
      byLap.set(key, {
        key,
        lapNumber,
        label: getLapTrailLabel(lapNumber),
        originalPointCount: Number(trail.originalPointCount || points.length),
        points: partPoints,
      });
    } else {
      existing.originalPointCount += Number(trail.originalPointCount || points.length);
      existing.points.push(...partPoints);
    }
  }

  return [...byLap.values()]
    .map((trail) => {
      const points = downsampleTrailPoints(
        normalizeTrailPoints(trail.points),
        maxPointsPerLap
      );

      return {
        ...trail,
        pointCount: points.length,
        points,
        startedAt: points[0]?.timestamp || null,
        endedAt: points[points.length - 1]?.timestamp || null,
      };
    })
    .filter((trail) => trail.lapNumber != null && trail.points.length >= 2)
    .sort((a, b) => a.lapNumber - b.lapNumber);
}

function compareMapPoints(a, b) {
  const aLap = getLapNumber(a, 0) || 0;
  const bLap = getLapNumber(b, 0) || 0;
  if (aLap !== bLap) return aLap - bLap;

  if (hasNumber(a.lapDistance) && hasNumber(b.lapDistance)) {
    const diff = Number(a.lapDistance) - Number(b.lapDistance);
    if (diff !== 0) return diff;
  }

  if (hasNumber(a.sampleIndex) && hasNumber(b.sampleIndex)) {
    return Number(a.sampleIndex) - Number(b.sampleIndex);
  }

  return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
}

function downsampleTrailPoints(points, maxPoints = 400) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points;
  if (maxPoints <= 2) return points.slice(0, maxPoints);

  const indexes = new Set([0, points.length - 1]);
  const step = (points.length - 1) / (maxPoints - 1);

  for (let i = 0; i < maxPoints; i += 1) {
    indexes.add(Math.round(i * step));
  }

  points.forEach((point, index) => {
    if (!point?.segmentBreakBefore) return;
    indexes.add(index);
    if (index > 0) indexes.add(index - 1);
  });

  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => points[index])
    .filter(Boolean);
}

function buildLapTrailsFromStoredPoints(points, maxPointsPerLap = 400) {
  const grouped = new Map();

  for (const point of points) {
    if (point.lapNumber == null || isPitMapSample(point)) continue;

    const key = getLapTrailKey(point.lapNumber);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(point);
  }

  return [...grouped.entries()]
    .map(([key, lapPoints]) => {
      const pointsForLap = downsampleTrailPoints(
        normalizeTrailPoints(lapPoints),
        maxPointsPerLap
      );
      const lapNumber = getLapNumber(pointsForLap[0], null);

      return {
        key,
        lapNumber,
        label: getLapTrailLabel(lapNumber),
        pointCount: pointsForLap.length,
        originalPointCount: lapPoints.length,
        points: pointsForLap,
        startedAt: pointsForLap[0]?.timestamp || null,
        endedAt: pointsForLap[pointsForLap.length - 1]?.timestamp || null,
      };
    })
    .filter((trail) => trail.lapNumber != null && trail.points.length >= 2)
    .sort((a, b) => a.lapNumber - b.lapNumber);
}

async function loadLapTrailsFromFirestore(sessionId, maxPointsPerLap = 400) {
  const chunksRef = collection(db, "sessions", sessionId, "telemetryChunks");
  const chunksQuery = query(chunksRef, orderBy(documentId()), limit(200));
  const snapshot = await getDocs(chunksQuery);
  const points = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const rawPoints =
      Array.isArray(data.mapPreviewPoints) && data.mapPreviewPoints.length > 0
        ? data.mapPreviewPoints
        : Array.isArray(data.samples)
          ? data.samples
          : [];

    for (const raw of rawPoints) {
      const point = readStoredMapPoint(raw);
      if (!point || point.lapNumber == null) continue;
      if (!hasNumber(point.worldX) || !hasNumber(point.worldZ)) continue;
      points.push(point);
    }
  });

  return buildLapTrailsFromStoredPoints(points, maxPointsPerLap);
}

export default function TrackTelemetryMap({
  apiBase,
  sessionId,
  trackKey,
  mapImageUrl = "/maps/default-track.png",
  selectedTrailKey = "current",
  liveMapPosition = null,
  liveMapPositionRef = null,
  onTrailOptionsChange,
}) {
  const canvasRef = useRef(null);
  const currentLapTrailRef = useRef([]);
  const currentLapNumberRef = useRef(null);
  const trackMapLoadSeqRef = useRef(0);
  const lapTrailLoadSeqRef = useRef(0);
  const livePositionLoadSeqRef = useRef(0);
  const latestLivePointFreshnessRef = useRef(null);
  const liveTrailActiveRef = useRef(false);
  const visualLivePointRef = useRef(null);
  const latestMapPositionRef = useRef(null);
  const latestAppliedLiveRefSampleRef = useRef(null);
  const completedLapTrailsRef = useRef([]);
  const selectedTrailKeyRef = useRef(selectedTrailKey);
  const trailUiUpdateTimerRef = useRef(0);

  const [trackMap, setTrackMap] = useState(null);
  const [currentLapTrail, setCurrentLapTrail] = useState([]);
  const [currentLapNumber, setCurrentLapNumber] = useState(null);
  const [completedLapTrails, setCompletedLapTrails] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapImage, setMapImage] = useState(null);
  const [mapImageError, setMapImageError] = useState(null);

  selectedTrailKeyRef.current = selectedTrailKey;

  function publishCurrentTrailState(immediate = false) {
    if (immediate) {
      if (trailUiUpdateTimerRef.current) {
        window.clearTimeout(trailUiUpdateTimerRef.current);
        trailUiUpdateTimerRef.current = 0;
      }
      setCurrentLapTrail([...currentLapTrailRef.current]);
      setCurrentLapNumber(currentLapNumberRef.current);
      return;
    }

    if (trailUiUpdateTimerRef.current) return;

    trailUiUpdateTimerRef.current = window.setTimeout(() => {
      trailUiUpdateTimerRef.current = 0;
      setCurrentLapTrail([...currentLapTrailRef.current]);
      setCurrentLapNumber(currentLapNumberRef.current);
    }, LIVE_MAP_TRAIL_UI_UPDATE_MS);
  }

  function saveCompletedLap(lapNumber, points) {
    if (lapNumber == null || !Array.isArray(points) || points.length < 2) {
      return;
    }

    const trail = {
      key: getLapTrailKey(lapNumber),
      lapNumber,
      label: getLapTrailLabel(lapNumber),
      pointCount: points.length,
      points,
      startedAt: points[0]?.timestamp || null,
      endedAt: points[points.length - 1]?.timestamp || null,
    };

    setCompletedLapTrails((prev) => {
      const withoutCurrentLap = prev.filter((item) => item.key !== trail.key);
      const next = [...withoutCurrentLap, trail].sort((a, b) => a.lapNumber - b.lapNumber);
      completedLapTrailsRef.current = next;
      return next;
    });
  }

  function resetLapTrails() {
    if (trailUiUpdateTimerRef.current) {
      window.clearTimeout(trailUiUpdateTimerRef.current);
      trailUiUpdateTimerRef.current = 0;
    }
    currentLapTrailRef.current = [];
    currentLapNumberRef.current = null;
    latestLivePointFreshnessRef.current = null;
    liveTrailActiveRef.current = false;
    visualLivePointRef.current = null;
    latestMapPositionRef.current = null;
    latestAppliedLiveRefSampleRef.current = null;
    completedLapTrailsRef.current = [];
    setCurrentLapTrail([]);
    setCurrentLapNumber(null);
    setCompletedLapTrails([]);
  }

  function mergeCompletedLapTrails(previous, incoming) {
    const byKey = new Map();

    for (const trail of previous || []) {
      byKey.set(trail.key, trail);
    }

    for (const trail of incoming || []) {
      const existing = byKey.get(trail.key);
      const existingPoints = existing?.points?.length || 0;
      const incomingPoints = trail?.points?.length || 0;

      if (!existing || incomingPoints >= existingPoints) {
        byKey.set(trail.key, trail);
      }
    }

    const next = [...byKey.values()].sort((a, b) => a.lapNumber - b.lapNumber);
    completedLapTrailsRef.current = next;
    return next;
  }

  function appendToCurrentLapTrail(latest) {
    const old = currentLapTrailRef.current;
    const last = old[old.length - 1];

    if (isSameMapPosition(last, latest)) {
      return;
    }

    if (isPitMapSample(latest)) {
      return;
    }

    if (last && isLapDistanceReset(last, latest)) {
      const next = normalizeTrailPoints([...old, latest]).slice(-1600);
      currentLapTrailRef.current = next;
      publishCurrentTrailState(true);
      return;
    }

    if (last && isTeleportJump(last, latest)) {
      currentLapTrailRef.current = [latest];
      publishCurrentTrailState(true);
      return;
    }

    const next = [...old, latest].slice(-1600);
    currentLapTrailRef.current = next;
    publishCurrentTrailState(false);
  }

  function applyLatestMapPosition(latest, nextSessionMap = null) {
    if (
      latest &&
      hasNumber(latest.worldX) &&
      hasNumber(latest.worldZ)
    ) {
      const freshness = readMapPointFreshness(latest);
      const freshnessDelta = compareMapPointFreshness(
        freshness,
        latestLivePointFreshnessRef.current
      );

      if (freshnessDelta < 0) {
        return;
      }

      if (
        freshnessDelta === 0 &&
        isSameMapPosition(
          currentLapTrailRef.current[currentLapTrailRef.current.length - 1],
          latest
        )
      ) {
        if (nextSessionMap) {
          latestMapPositionRef.current = nextSessionMap.latestMapPosition || latestMapPositionRef.current;
        }
        return;
      }

      if (freshnessDelta > 0) {
        latestLivePointFreshnessRef.current = freshness;
      }

      latestMapPositionRef.current = latest;

      const previousLapNumber = currentLapNumberRef.current;
      const nextLapNumber = getLapNumber(latest, previousLapNumber);

      if (previousLapNumber === null && nextLapNumber !== null) {
        currentLapNumberRef.current = nextLapNumber;
        setCurrentLapNumber(nextLapNumber);
      }

      if (
        previousLapNumber !== null &&
        nextLapNumber !== null &&
        nextLapNumber !== previousLapNumber
      ) {
        saveCompletedLap(previousLapNumber, currentLapTrailRef.current);

        currentLapTrailRef.current = [];
        currentLapNumberRef.current = nextLapNumber;
        publishCurrentTrailState(true);
        setCurrentLapNumber(nextLapNumber);
      }

      liveTrailActiveRef.current = true;
      appendToCurrentLapTrail(latest);
      return;
    }

    if (nextSessionMap) {
      latestMapPositionRef.current = nextSessionMap.latestMapPosition || latestMapPositionRef.current;
    }
  }

  useEffect(() => {
    resetLapTrails();
  }, [sessionId]);

  useEffect(() => {
    const requestId = trackMapLoadSeqRef.current + 1;
    trackMapLoadSeqRef.current = requestId;
    const abortController = new AbortController();

    async function loadTrackMap() {
      try {
        setError(null);

        if (!apiBase || !trackKey) {
          setTrackMap(null);
          return;
        }

        const res = await fetch(
          `${apiBase}/track-maps/${trackKey}?includeCenterline=true`,
          { signal: abortController.signal }
        );

        if (!res.ok) {
          throw new Error("Failed to load track map.");
        }

        const data = await res.json();
        if (trackMapLoadSeqRef.current !== requestId) return;
        setTrackMap(data);
      } catch (err) {
        if (err?.name === "AbortError" || trackMapLoadSeqRef.current !== requestId) return;
        console.error(err);
        setError(err.message);
      }
    }

    loadTrackMap();

    return () => {
      abortController.abort();
    };
  }, [apiBase, trackKey]);

  useEffect(() => {
    if (!sessionId) return undefined;

    const requestId = lapTrailLoadSeqRef.current + 1;
    lapTrailLoadSeqRef.current = requestId;
    const abortController = new AbortController();
    let cancelled = false;
    let loadingSavedLapTrails = false;
    setHistoryLoading(true);

    function isCurrentRequest() {
      return !cancelled && lapTrailLoadSeqRef.current === requestId;
    }

    function applyTrails(trails) {
      if (!isCurrentRequest()) return;

      setCompletedLapTrails((prev) => mergeCompletedLapTrails(prev, trails));

      if (
        trails.length > 0 &&
        !liveTrailActiveRef.current &&
        currentLapTrailRef.current.length < 2
      ) {
        const latestTrail = trails[trails.length - 1];
        currentLapNumberRef.current = latestTrail.lapNumber;
        currentLapTrailRef.current = latestTrail.points;
        setCurrentLapNumber(latestTrail.lapNumber);
        setCurrentLapTrail(latestTrail.points);
      }
    }

    async function loadSavedLapTrails() {
      if (loadingSavedLapTrails || !isCurrentRequest()) return;
      loadingSavedLapTrails = true;

      try {
        let trails = [];
        let apiError = null;

        if (apiBase) {
          try {
            const res = await fetch(
              `${apiBase}/sessions/${sessionId}/lap-trails?maxPointsPerLap=900`,
              { headers: getAuthHeaders(), signal: abortController.signal }
            );

            if (!res.ok) {
              throw new Error("Failed to load saved lap trails from backend.");
            }

            const data = await res.json();
            if (!isCurrentRequest()) return;
            trails = normalizeLapTrailsFromApi(data.lapTrails, 900);
          } catch (err) {
            if (err?.name === "AbortError" || !isCurrentRequest()) return;
            apiError = err;
            console.warn("Backend lap trail load failed, using Firestore fallback:", err);
          }
        }

        if (trails.length === 0) {
          trails = await loadLapTrailsFromFirestore(sessionId, 900);
        }

        if (!isCurrentRequest()) return;

        applyTrails(trails);
        setHistoryLoading(false);
        setError(null);

        if (trails.length === 0 && apiError) {
          console.warn("No Firestore lap trails found after backend failure:", apiError);
        }
      } catch (err) {
        if (err?.name === "AbortError" || !isCurrentRequest()) return;

        console.error("Lap trail history load error:", err);
        setHistoryLoading(false);
        setError(err.message || "Failed to load saved lap trails.");
      } finally {
        loadingSavedLapTrails = false;
      }
    }

    loadSavedLapTrails();
    const interval = setInterval(loadSavedLapTrails, 5000);

    return () => {
      cancelled = true;
      abortController.abort();
      clearInterval(interval);
    };
  }, [apiBase, sessionId]);

  const hasLiveMapPositionProp = Boolean(liveMapPosition);

  useEffect(() => {
    if (!apiBase || !sessionId || hasLiveMapPositionProp) return undefined;

    const requestId = livePositionLoadSeqRef.current + 1;
    livePositionLoadSeqRef.current = requestId;
    const abortController = new AbortController();
    let cancelled = false;
    let liveFetchInFlight = false;

    function isCurrentRequest() {
      return !cancelled && livePositionLoadSeqRef.current === requestId;
    }

    async function fetchLivePosition() {
      if (liveFetchInFlight || !isCurrentRequest()) return;
      liveFetchInFlight = true;

      try {
        const res = await fetch(`${apiBase}/sessions/${sessionId}/track-map`, {
          headers: getAuthHeaders(),
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error("Failed to load live session map data.");
        }

        const data = await res.json();
        if (!isCurrentRequest()) return;

        applyLatestMapPosition(data.latestMapPosition, data);
      } catch (err) {
        if (err?.name === "AbortError" || !isCurrentRequest()) return;
        console.error(err);
        setError(err.message);
      } finally {
        liveFetchInFlight = false;
      }
    }

    fetchLivePosition();
    const interval = setInterval(fetchLivePosition, LIVE_MAP_FETCH_INTERVAL_MS);

    return () => {
      cancelled = true;
      abortController.abort();
      clearInterval(interval);
    };
  }, [apiBase, sessionId, hasLiveMapPositionProp]);

  useEffect(() => {
    if (!liveMapPosition) return;
    applyLatestMapPosition(liveMapPosition);
  }, [liveMapPosition]);

  const imageUrl = normalizeTrackMapImageUrl(
    trackMap?.imageCalibration?.imageUrl || mapImageUrl
  );

  const imageWidth = Number(trackMap?.imageCalibration?.imageWidth || 1200);
  const imageHeight = Number(trackMap?.imageCalibration?.imageHeight || 800);
  const canvasAspectRatio = `${imageWidth || 1200} / ${imageHeight || 800}`;

  useEffect(() => {
    let cancelled = false;
    const image = new Image();

    setMapImage(null);
    setMapImageError(null);

    image.onload = () => {
      if (cancelled) return;
      setMapImage(image);
      setMapImageError(null);
    };

    image.onerror = () => {
      if (cancelled) return;
      setMapImage(null);
      setMapImageError(`Map image not found: ${imageUrl}`);
    };

    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const transform = useMemo(() => {
    const anchors = trackMap?.imageCalibration?.anchorPoints;

    const calibratedTransform = solveLeastSquaresAffine(anchors);

    if (calibratedTransform) {
      return calibratedTransform;
    }

    return solveBoundsTransform(trackMap?.worldBounds, imageWidth, imageHeight);
  }, [trackMap, imageWidth, imageHeight]);

  useEffect(() => {
    if (!onTrailOptionsChange) return;

    const currentLabel =
      currentLapNumber == null
        ? "Current Lap Trail"
        : `Current Lap ${currentLapNumber} Trail`;
    const savedCurrentLap =
      currentLapNumber != null &&
      completedLapTrails.some((trail) => trail.lapNumber === currentLapNumber);
    const savedLapOptions = completedLapTrails.map((trail) => ({
      key: trail.key,
      type: "lap",
      lapNumber: trail.lapNumber,
      label: `Lap ${trail.lapNumber}`,
      pointCount: trail.pointCount,
    }));
    const shouldShowCurrentOption =
      currentLapTrail.length > 1 && !savedCurrentLap;
    const options = [...savedLapOptions];

    if (shouldShowCurrentOption || options.length === 0) {
      options.push({
        key: "current",
        type: "current",
        lapNumber: currentLapNumber,
        label: currentLabel,
        pointCount: currentLapTrail.length,
      });
    }

    onTrailOptionsChange({
      currentLapNumber,
      currentPointCount: currentLapTrail.length,
      completedLapTrails,
      historyLoading,
      options,
    });
  }, [
    currentLapNumber,
    currentLapTrail.length,
    completedLapTrails,
    historyLoading,
    onTrailOptionsChange,
  ]);

  function getDisplayedTrailSnapshot() {
    const completedTrails = completedLapTrailsRef.current;
    const selectedKey = selectedTrailKeyRef.current;
    const currentTrail = currentLapTrailRef.current;
    const currentLap = currentLapNumberRef.current;
    const selectedCompletedTrail =
      completedTrails.find((trail) => trail.key === selectedKey) || null;
    const fallbackCompletedTrail = completedTrails[0] || null;
    const activeTrailKey =
      selectedKey === "current" || selectedCompletedTrail
        ? selectedKey
        : fallbackCompletedTrail?.key || "current";
    const activeCompletedTrail =
      activeTrailKey === "current"
        ? null
        : selectedCompletedTrail || fallbackCompletedTrail;
    const shouldUseLiveTrailForSelectedLap =
      activeCompletedTrail?.lapNumber === currentLap &&
      currentTrail.length > (activeCompletedTrail?.points?.length || 0);
    const trail =
      activeTrailKey === "current"
        ? currentTrail
        : shouldUseLiveTrailForSelectedLap
          ? currentTrail
          : activeCompletedTrail?.points || [];
    const label =
      activeTrailKey === "current"
        ? currentLap == null
          ? "Current Lap Trail"
          : `Current Lap ${currentLap} Trail`
        : activeCompletedTrail?.label || "Saved Lap Trail";

    return {
      label,
      trail,
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frameId = 0;

    function drawFrame() {
      const ctx = canvas.getContext("2d");
      const width = imageWidth || mapImage?.naturalWidth || 1200;
      const height = imageHeight || mapImage?.naturalHeight || 800;

      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      ctx.clearRect(0, 0, width, height);

      if (mapImage) {
        ctx.drawImage(mapImage, 0, 0, width, height);
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
        ctx.font = "16px Arial";
        ctx.fillText(mapImageError || "Loading map image...", 30, 50);
      }

      if (!trackMap || !transform) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(20, 20, 620, 75);

        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText("Waiting for track map / calibration...", 36, 55);

        ctx.font = "13px Arial";
        ctx.fillText(
          "Generate reference line, then save at least 3 anchor points.",
          36,
          80
        );

        frameId = window.requestAnimationFrame(drawFrame);
        return;
      }

      const latestRefPosition = liveMapPositionRef?.current;
      if (
        latestRefPosition &&
        latestRefPosition !== latestAppliedLiveRefSampleRef.current
      ) {
        latestAppliedLiveRefSampleRef.current = latestRefPosition;
        applyLatestMapPosition(latestRefPosition);
      }

      const centerline = Array.isArray(trackMap.centerline)
        ? trackMap.centerline
        : [];

      if (centerline.length > 1) {
        ctx.save();
        ctx.beginPath();

        let started = false;

        for (const point of centerline) {
          const readable = readCenterlinePoint(point);
          if (!readable) continue;

          const pos = transform.worldToImage(readable.worldX, readable.worldZ);

          if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;

          if (!started) {
            ctx.moveTo(pos.x, pos.y);
            started = true;
          } else {
            ctx.lineTo(pos.x, pos.y);
          }
        }

        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.stroke();
        ctx.restore();
      }

      const displayed = getDisplayedTrailSnapshot();

      drawSmoothTelemetryTrail(ctx, displayed.trail, transform);

      drawTextBadge(
        ctx,
        `${displayed.label} (${displayed.trail.length} points)`,
        20,
        52
      );

      const latest = getVisualLivePoint(
        visualLivePointRef,
        latestMapPositionRef.current
      );

      if (
        latest &&
        hasNumber(latest.worldX) &&
        hasNumber(latest.worldZ)
      ) {
        const pos = transform.worldToImage(latest.worldX, latest.worldZ);

        if (Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
          ctx.fillStyle = "white";
          ctx.fill();

          ctx.lineWidth = 4;
          ctx.strokeStyle = getTelemetryColor(latest);
          ctx.stroke();

          const speedText =
            latest.speedKph != null
              ? `${Math.round(Number(latest.speedKph))} km/h`
              : "Live";

          drawTextBadge(ctx, speedText, pos.x + 12, pos.y - 12);
        }
      }

      if (transform.anchorCount > 0) {
        const rmseText =
          transform.rmsePixels != null
            ? `Calibration: ${transform.anchorCount} anchors, +/-${transform.rmsePixels.toFixed(
                1
              )} px`
            : `Calibration: ${transform.anchorCount} anchors`;

        ctx.font = "13px Arial";
        const badgeWidth = ctx.measureText(rmseText).width + 20;

        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(16, height - 38, badgeWidth, 26);

        ctx.fillStyle = "white";
        ctx.fillText(rmseText, 26, height - 20);
      }
      frameId = window.requestAnimationFrame(drawFrame);
    }

    frameId = window.requestAnimationFrame(drawFrame);

    return () => window.cancelAnimationFrame(frameId);
  }, [
    trackMap,
    transform,
    mapImage,
    mapImageError,
    imageWidth,
    imageHeight,
    liveMapPositionRef,
  ]);

  return (
    <div style={{ width: "100%" }}>
      {error && (
        <div
          style={{
            padding: "10px",
            marginBottom: "10px",
            color: "white",
            background: "#8b1d1d",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      )}

      {historyLoading && (
        <p style={{ marginTop: 0, color: "#aaa", fontSize: "14px" }}>
          Loading saved lap trails...
        </p>
      )}

      <div
        style={{
          width: "100%",
          maxWidth: "1000px",
          aspectRatio: canvasAspectRatio,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            boxSizing: "border-box",
            borderRadius: "14px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        />
      </div>

      <div
        style={{
          marginTop: "10px",
          display: "flex",
          gap: "14px",
          flexWrap: "wrap",
          color: "white",
          fontSize: "14px",
        }}
      >
        <span>
          <b style={{ color: "rgb(255, 60, 60)" }}>--</b> Brake
        </span>
        <span>
          <b style={{ color: "rgb(50, 255, 100)" }}>--</b> Throttle
        </span>
        <span>
          <b style={{ color: "rgb(80, 160, 255)" }}>--</b> Steering / cornering
        </span>
        <span>
          <b style={{ color: "rgb(160, 160, 160)" }}>--</b> Coasting
        </span>
        <span>
          <b style={{ color: "white" }}>o</b> Current car
        </span>
      </div>
    </div>
  );
}

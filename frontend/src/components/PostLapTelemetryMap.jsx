import { useEffect, useMemo, useRef, useState } from "react";
import { trimFutureLapPointsOnReset } from "../utils/lapResetTrim";
import { resolveTrackMapImageUrl } from "../utils/mapImages";

function hasNumber(value) {
  return Number.isFinite(Number(value));
}

function number(value) {
  return Number(value);
}

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");
  return token ? { Authorization: "Bearer " + token } : {};
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

  if (Math.abs(det) < 0.000000001) return null;

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

function solveAffine(anchorPoints) {
  const points = Array.isArray(anchorPoints)
    ? anchorPoints.filter(
        (point) =>
          hasNumber(point.worldX) &&
          hasNumber(point.worldZ) &&
          hasNumber(point.imageX) &&
          hasNumber(point.imageY)
      )
    : [];

  if (points.length < 3) return null;

  let sumXX = 0;
  let sumXZ = 0;
  let sumX = 0;
  let sumZZ = 0;
  let sumZ = 0;
  let sumImageXWorldX = 0;
  let sumImageXWorldZ = 0;
  let sumImageX = 0;
  let sumImageYWorldX = 0;
  let sumImageYWorldZ = 0;
  let sumImageY = 0;

  for (const point of points) {
    const worldX = number(point.worldX);
    const worldZ = number(point.worldZ);
    const imageX = number(point.imageX);
    const imageY = number(point.imageY);
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

  const inverse = invert3x3([
    [sumXX, sumXZ, sumX],
    [sumXZ, sumZZ, sumZ],
    [sumX, sumZ, points.length],
  ]);
  if (!inverse) return null;

  const xCoefficients = multiplyMatrixVector(inverse, [
    sumImageXWorldX,
    sumImageXWorldZ,
    sumImageX,
  ]);
  const yCoefficients = multiplyMatrixVector(inverse, [
    sumImageYWorldX,
    sumImageYWorldZ,
    sumImageY,
  ]);

  return {
    worldToImage(worldX, worldZ) {
      const x = number(worldX);
      const z = number(worldZ);
      return {
        x: xCoefficients[0] * x + xCoefficients[1] * z + xCoefficients[2],
        y: yCoefficients[0] * x + yCoefficients[1] * z + yCoefficients[2],
      };
    },
  };
}

function scaleTransform(transform, scaleX, scaleY) {
  if (!transform) return null;
  const xScale = Number.isFinite(Number(scaleX)) ? Number(scaleX) : 1;
  const yScale = Number.isFinite(Number(scaleY)) ? Number(scaleY) : 1;

  return {
    worldToImage(worldX, worldZ) {
      const point = transform.worldToImage(worldX, worldZ);
      return {
        x: point.x * xScale,
        y: point.y * yScale,
      };
    },
  };
}

function boundsFromTraces(traces) {
  const points = traces.filter(
    (sample) => hasNumber(sample.worldX) && hasNumber(sample.worldZ)
  );
  if (points.length < 2) return null;

  const xs = points.map((sample) => number(sample.worldX));
  const zs = points.map((sample) => number(sample.worldZ));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function solveBounds(worldBounds, imageWidth, imageHeight) {
  if (!worldBounds) return null;
  const minX = number(worldBounds.minX);
  const maxX = number(worldBounds.maxX);
  const minZ = number(worldBounds.minZ);
  const maxZ = number(worldBounds.maxZ);
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  if (minX === maxX || minZ === maxZ) return null;

  return {
    worldToImage(worldX, worldZ) {
      const xRatio = (number(worldX) - minX) / (maxX - minX);
      const zRatio = (number(worldZ) - minZ) / (maxZ - minZ);
      return {
        x: (1 - xRatio) * imageWidth,
        y: (1 - zRatio) * imageHeight,
      };
    },
  };
}

function readCenterlinePoint(point) {
  const worldX = point?.worldX ?? point?.x;
  const worldZ = point?.worldZ ?? point?.z;
  if (!hasNumber(worldX) || !hasNumber(worldZ)) return null;
  return { worldX: number(worldX), worldZ: number(worldZ) };
}

function telemetryColor(sample) {
  const brake = Math.max(0, Math.min(100, number(sample?.brakePct) || 0));
  const throttle = Math.max(0, Math.min(100, number(sample?.throttlePct) || 0));
  if (brake >= 8) return "#ef4444";
  if (throttle >= 8) return "#22c55e";
  return "#94a3b8";
}

function isJump(a, b) {
  if (!a || !b) return false;
  const dx = number(a.worldX) - number(b.worldX);
  const dz = number(a.worldZ) - number(b.worldZ);
  return Math.sqrt(dx * dx + dz * dz) >= 180;
}

function drawBadge(ctx, text, x, y) {
  ctx.font = "600 14px Arial";
  const width = ctx.measureText(text).width + 16;
  ctx.fillStyle = "rgba(2, 6, 23, 0.82)";
  ctx.fillRect(x, y - 22, width, 26);
  ctx.fillStyle = "white";
  ctx.fillText(text, x + 8, y - 4);
}

const MAP_NUMERIC_FIELDS = [
  "index",
  "sampleIndex",
  "lapDistance",
  "distanceM",
  "worldX",
  "worldY",
  "worldZ",
  "steering",
  "speedKph",
  "throttlePct",
  "brakePct",
  "rpm",
  "gear",
  "corneringSpeedKph",
  "brakingDistanceM",
];

function lerpNumber(a, b, amount) {
  const from = Number(a);
  const to = Number(b);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    return from + (to - from) * amount;
  }
  if (Number.isFinite(from)) return from;
  if (Number.isFinite(to)) return to;
  return null;
}

function interpolateMapSample(samples, position) {
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const rawPosition = Number(position);
  const clamped = Number.isFinite(rawPosition)
    ? Math.max(0, Math.min(rawPosition, samples.length - 1))
    : samples.length - 1;
  const leftIndex = Math.floor(clamped);
  const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
  const amount = rightIndex === leftIndex ? 0 : clamped - leftIndex;
  const left = samples[leftIndex] || {};
  const right = samples[rightIndex] || left;
  const next = {
    ...left,
    index: clamped,
  };

  for (const key of MAP_NUMERIC_FIELDS) {
    const value = lerpNumber(left[key], right[key], amount);
    if (value !== null) next[key] = value;
  }

  if (amount >= 0.5) {
    next.drs = right.drs;
    next.sector = right.sector;
  }

  return next;
}

export default function PostLapTelemetryMap({
  apiBase,
  trackKey,
  traces,
  activeIndex,
  sectorBoundaries = [],
  containerStyle,
  flipMap = false,
  rotateDeg = 0,
  traceScale = 0.8,
  traceHScale = 1,
}) {
  const canvasRef = useRef(null);
  const [trackMap, setTrackMap] = useState(null);
  const [mapImage, setMapImage] = useState(null);
  const [error, setError] = useState("");
  const mapTraces = useMemo(
    () => trimFutureLapPointsOnReset(traces),
    [traces]
  );

  useEffect(() => {
    if (!apiBase || !trackKey) {
      setTrackMap(null);
      return undefined;
    }

    const controller = new AbortController();

    async function loadTrackMap() {
      try {
        setError("");
        const res = await fetch(
          apiBase +
            "/track-maps/" +
            encodeURIComponent(trackKey) +
            "?includeCenterline=true",
          { headers: getAuthHeaders(), signal: controller.signal }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Track map could not be loaded.");
        setTrackMap(body);
      } catch (err) {
        if (err?.name !== "AbortError") {
          setError(err.message || "Track map could not be loaded.");
        }
      }
    }

    loadTrackMap();
    return () => controller.abort();
  }, [apiBase, trackKey]);

  const imageUrl = resolveTrackMapImageUrl(
    trackMap?.imageCalibration?.imageUrl,
    trackKey
  );
  const hasMapImage = Boolean(imageUrl);

  useEffect(() => {
    let cancelled = false;

    async function loadMapImage() {
      if (!imageUrl) {
        setMapImage(null);
        return;
      }

      const image = new Image();
      image.onload = () => {
        if (!cancelled) setMapImage(image);
      };
      image.onerror = () => {
        if (!cancelled) setMapImage(null);
      };
      image.src = imageUrl;
    }

    setMapImage(null);
    loadMapImage();
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const savedImageWidth = Number(trackMap?.imageCalibration?.imageWidth || 0);
  const savedImageHeight = Number(trackMap?.imageCalibration?.imageHeight || 0);
  const loadedImageWidth = Number(mapImage?.naturalWidth || 0);
  const loadedImageHeight = Number(mapImage?.naturalHeight || 0);
  const imageWidth = loadedImageWidth || 1200;
  const imageHeight = loadedImageHeight || 675;
  const calibrationImageWidth = savedImageWidth || imageWidth;
  const calibrationImageHeight = savedImageHeight || imageHeight;
  const calibrationScaleX = calibrationImageWidth
    ? imageWidth / calibrationImageWidth
    : 1;
  const calibrationScaleY = calibrationImageHeight
    ? imageHeight / calibrationImageHeight
    : 1;

  const transform = useMemo(() => {
    const calibratedTransform = solveAffine(trackMap?.imageCalibration?.anchorPoints);
    if (calibratedTransform) {
      return scaleTransform(calibratedTransform, calibrationScaleX, calibrationScaleY);
    }

    return solveBounds(
      trackMap?.worldBounds || boundsFromTraces(mapTraces),
      imageWidth,
      imageHeight
    );
  }, [
    calibrationScaleX,
    calibrationScaleY,
    imageHeight,
    imageWidth,
    mapTraces,
    trackMap,
  ]);

  const effectiveTransform = useMemo(() => {
    if (!transform) return null;
    if (!flipMap) return transform;
    return {
      worldToImage(worldX, worldZ) {
        const p = transform.worldToImage(worldX, worldZ);
        return { x: imageWidth - p.x, y: imageHeight - p.y };
      },
    };
  }, [transform, imageWidth, imageHeight, flipMap]);
  const positionedSamples = useMemo(
    () =>
      mapTraces
        .map((sample, index) => ({ sample, index }))
        .filter(
          ({ sample }) =>
            hasNumber(sample.worldX) && hasNumber(sample.worldZ)
        ),
    [mapTraces]
  );

  // Optionally apply rotation (degrees clockwise) around canvas center.
  const rotatedTransform = useMemo(() => {
    if (!effectiveTransform) return null;
    const deg = Number(rotateDeg) || 0;
    const normalized = ((deg % 360) + 360) % 360;
    if (normalized === 0) return effectiveTransform;
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;
    if (normalized === 90) {
      // rotate 90 degrees clockwise (screen coords) - map right -> down
      return {
        worldToImage(worldX, worldZ) {
          const p = effectiveTransform.worldToImage(worldX, worldZ);
          const xr = -(p.y - cy);
          const yr = p.x - cx;
          return { x: cx + xr, y: cy + yr };
        },
      };
    }
    if (normalized === 180) {
      return {
        worldToImage(worldX, worldZ) {
          const p = effectiveTransform.worldToImage(worldX, worldZ);
          return { x: imageWidth - p.x, y: imageHeight - p.y };
        },
      };
    }
    if (normalized === 270) {
      return {
        worldToImage(worldX, worldZ) {
          const p = effectiveTransform.worldToImage(worldX, worldZ);
          const xr = p.y - cy;
          const yr = -(p.x - cx);
          return { x: cx + xr, y: cy + yr };
        },
      };
    }
    return effectiveTransform;
  }, [effectiveTransform, rotateDeg, imageWidth, imageHeight]);

  const positionedEffectiveTransform = useMemo(() => {
    const base = rotatedTransform || effectiveTransform;
    if (!base) return null;
    return base;
  }, [rotatedTransform, effectiveTransform]);

  // Reduce vertical stretch for the drawn lap trace only (1 = no scale)
  const mapForTrace = useMemo(() => {
    if (!positionedEffectiveTransform) return null;
    const cy = imageHeight / 2;
    const vs = Number(traceScale) || 1;
    const hs = Number(traceHScale) || 1;
    const cx = imageWidth / 2;
    return (worldX, worldZ) => {
      const p = positionedEffectiveTransform.worldToImage(worldX, worldZ);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return p;
      return { x: cx + (p.x - cx) * hs, y: cy + (p.y - cy) * vs };
    };
  }, [positionedEffectiveTransform, imageHeight, imageWidth, traceScale, traceHScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let cancelled = false;

    canvas.width = imageWidth;
    canvas.height = imageHeight;

    function drawScene(image) {
      if (cancelled) return;
      ctx.clearRect(0, 0, imageWidth, imageHeight);
      ctx.fillStyle = "#07111f";
      ctx.fillRect(0, 0, imageWidth, imageHeight);
      if (image) ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

      if (!positionedEffectiveTransform) {
        drawBadge(ctx, "No map calibration is available", 20, 48);
        return;
      }

      const centerline = Array.isArray(trackMap?.centerline)
        ? trackMap.centerline.map(readCenterlinePoint).filter(Boolean)
        : [];
      if (centerline.length > 1) {
        ctx.beginPath();
        centerline.forEach((point, index) => {
          const pos = positionedEffectiveTransform.worldToImage(point.worldX, point.worldZ);
          if (index === 0) ctx.moveTo(pos.x, pos.y);
          else ctx.lineTo(pos.x, pos.y);
        });
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.stroke();
      }

      for (let i = 1; i < positionedSamples.length; i += 1) {
        const previous = positionedSamples[i - 1].sample;
        const current = positionedSamples[i].sample;
        if (isJump(previous, current)) continue;
        const from = mapForTrace ? mapForTrace(previous.worldX, previous.worldZ) : positionedEffectiveTransform.worldToImage(previous.worldX, previous.worldZ);
        const to = mapForTrace ? mapForTrace(current.worldX, current.worldZ) : positionedEffectiveTransform.worldToImage(current.worldX, current.worldZ);
        if (!from || !to) continue;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.strokeStyle = telemetryColor(current);
        ctx.stroke();
      }

      for (const boundary of sectorBoundaries) {
        const sample = mapTraces[boundary.index];
        if (!sample || !hasNumber(sample.worldX) || !hasNumber(sample.worldZ)) continue;
        const pos = mapForTrace ? mapForTrace(sample.worldX, sample.worldZ) : positionedEffectiveTransform.worldToImage(sample.worldX, sample.worldZ);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = boundary.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#07111f";
        ctx.stroke();
        drawBadge(ctx, boundary.label, pos.x + 10, pos.y - 8);
      }

      const fallbackIndex = positionedSamples[positionedSamples.length - 1]?.index;
      const activePosition = Number.isFinite(Number(activeIndex))
        ? Math.max(0, Math.min(Number(activeIndex), mapTraces.length - 1))
        : fallbackIndex;
      const markerSample = interpolateMapSample(mapTraces, activePosition);
      if (
        markerSample &&
        hasNumber(markerSample.worldX) &&
        hasNumber(markerSample.worldZ)
      ) {
        const pos = mapForTrace ? mapForTrace(markerSample.worldX, markerSample.worldZ) : positionedEffectiveTransform.worldToImage(markerSample.worldX, markerSample.worldZ);
        const headingSample =
          interpolateMapSample(mapTraces, Math.min(Number(activePosition) + 0.85, mapTraces.length - 1)) ||
          markerSample;
        const nextPos =
          hasNumber(headingSample.worldX) && hasNumber(headingSample.worldZ)
            ? (mapForTrace ? mapForTrace(headingSample.worldX, headingSample.worldZ) : positionedEffectiveTransform.worldToImage(headingSample.worldX, headingSample.worldZ))
            : pos;
        const angle = Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x);

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(9, 10);
        ctx.lineTo(0, 6);
        ctx.lineTo(-9, 10);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = telemetryColor(markerSample);
        ctx.stroke();
        ctx.restore();

        drawBadge(
          ctx,
          Math.round(number(markerSample.speedKph) || 0) + " km/h",
          pos.x + 14,
          pos.y - 14
        );
      }

      drawBadge(
        ctx,
        positionedSamples.length + " saved position samples",
        20,
        48
      );
    }

    drawScene(mapImage);

    return () => {
      cancelled = true;
    };
  }, [
    activeIndex,
    imageHeight,
    imageWidth,
    mapImage,
    mapTraces,
    positionedSamples,
    sectorBoundaries,
    trackMap,
    positionedEffectiveTransform,
    traceScale,
    traceHScale,
  ]);

  if (positionedSamples.length < 2) {
    return (
      <div className="card" style={{ marginBottom: 20, ...containerStyle }}>
        <h2>Lap Map</h2>
        <p style={{ color: "#94a3b8" }}>
          This lap has no saved world-position samples. New laps will include them after the backend update.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 20, ...containerStyle }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Lap Map</h2>
        <p style={{ color: "#94a3b8", margin: "5px 0 0" }}>
          Move across the telemetry chart to replay the car position.
        </p>
      </div>
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          maxWidth: hasMapImage ? undefined : 720,
          margin: hasMapImage ? undefined : "0 auto",
          aspectRatio: imageWidth + " / " + imageHeight,
          background: "#07111f",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 8,
        }}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          marginTop: 10,
          color: "#cbd5e1",
          fontSize: 13,
        }}
      >
        <span><b style={{ color: "#ef4444" }}>-</b> Brake</span>
        <span><b style={{ color: "#22c55e" }}>-</b> Throttle</span>
        <span><b style={{ color: "#94a3b8" }}>-</b> Coast</span>
        <span><b style={{ color: "white" }}>▲</b> Car position</span>
      </div>
    </div>
  );
}

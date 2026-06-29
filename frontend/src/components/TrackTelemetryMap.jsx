import { useEffect, useMemo, useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hasNumber(value) {
  return Number.isFinite(Number(value));
}

function num(value) {
  return Number(value);
}

function getTelemetryColor(sample) {
  const brake = clamp(sample?.brake, 0, 1);
  const throttle = clamp(sample?.throttle, 0, 1);
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
        x: xNorm * imageWidth,
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

function drawSmoothTelemetryTrail(ctx, trail, transform) {
  const points = getTrailPoints(trail, transform);

  if (points.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 2) {
    const a = points[0];
    const b = points[1];

    ctx.lineWidth = 12;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = getTelemetryColor(b.sample);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.lineWidth = 5;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = getTelemetryColor(b.sample);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.restore();
    return;
  }

  ctx.lineWidth = 12;
  ctx.globalAlpha = 0.22;

  for (let i = 1; i < points.length - 1; i++) {
    drawTrailSegment(
      ctx,
      points[i - 1],
      points[i],
      points[i + 1],
      getTelemetryColor(points[i].sample)
    );
  }

  ctx.lineWidth = 5;
  ctx.globalAlpha = 1;

  for (let i = 1; i < points.length - 1; i++) {
    drawTrailSegment(
      ctx,
      points[i - 1],
      points[i],
      points[i + 1],
      getTelemetryColor(points[i].sample)
    );
  }

  ctx.restore();
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

export default function TrackTelemetryMap({
  apiBase,
  sessionId,
  trackKey,
  mapImageUrl = "/maps/default-track.png",
}) {
  const canvasRef = useRef(null);

  const [trackMap, setTrackMap] = useState(null);
  const [sessionMap, setSessionMap] = useState(null);
  const [trail, setTrail] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTrackMap() {
      try {
        setError(null);

        if (!apiBase || !trackKey) return;

        const res = await fetch(
          `${apiBase}/track-maps/${trackKey}?includeCenterline=true`
        );

        if (!res.ok) {
          throw new Error("Failed to load track map.");
        }

        const data = await res.json();
        setTrackMap(data);
      } catch (err) {
        console.error(err);
        setError(err.message);
      }
    }

    loadTrackMap();
  }, [apiBase, trackKey]);

  useEffect(() => {
    setTrail([]);

    async function fetchLivePosition() {
      try {
        if (!apiBase || !sessionId) return;

        const res = await fetch(`${apiBase}/sessions/${sessionId}/track-map`);

        if (!res.ok) {
          throw new Error("Failed to load live session map data.");
        }

        const data = await res.json();
        setSessionMap(data);

        const latest = data.latestMapPosition;

        if (
          latest &&
          hasNumber(latest.worldX) &&
          hasNumber(latest.worldZ)
        ) {
          setTrail((old) => {
            const last = old[old.length - 1];

            const samePosition =
              last &&
              Number(last.worldX).toFixed(3) ===
                Number(latest.worldX).toFixed(3) &&
              Number(last.worldZ).toFixed(3) ===
                Number(latest.worldZ).toFixed(3);

            if (samePosition) {
              return old;
            }

            const next = [...old, latest];
            return next.slice(-1600);
          });
        }
      } catch (err) {
        console.error(err);
        setError(err.message);
      }
    }

    fetchLivePosition();
    const interval = setInterval(fetchLivePosition, 200);

    return () => clearInterval(interval);
  }, [apiBase, sessionId]);

  const imageUrl = trackMap?.imageCalibration?.imageUrl || mapImageUrl;

  const imageWidth = Number(trackMap?.imageCalibration?.imageWidth || 1200);
  const imageHeight = Number(trackMap?.imageCalibration?.imageHeight || 800);

  const transform = useMemo(() => {
    const anchors = trackMap?.imageCalibration?.anchorPoints;

    const calibratedTransform = solveLeastSquaresAffine(anchors);

    if (calibratedTransform) {
      return calibratedTransform;
    }

    return solveBoundsTransform(trackMap?.worldBounds, imageWidth, imageHeight);
  }, [trackMap, imageWidth, imageHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const image = new Image();

    image.src = imageUrl;

    image.onload = () => {
      const width = imageWidth || image.naturalWidth || 1200;
      const height = imageHeight || image.naturalHeight || 800;

      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

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

        return;
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

      drawSmoothTelemetryTrail(ctx, trail, transform);

      const latest = sessionMap?.latestMapPosition;

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
            ? `Calibration: ${transform.anchorCount} anchors, ±${transform.rmsePixels.toFixed(
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
    };

    image.onerror = () => {
      const width = imageWidth || 1200;
      const height = imageHeight || 800;

      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "white";
      ctx.font = "16px Arial";
      ctx.fillText(`Map image not found: ${imageUrl}`, 30, 50);
    };
  }, [
    trackMap,
    transform,
    trail,
    sessionMap,
    imageUrl,
    imageWidth,
    imageHeight,
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

      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          maxWidth: "1000px",
          borderRadius: "14px",
          background: "#111",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      />

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
          <b style={{ color: "rgb(255, 60, 60)" }}>━</b> Brake
        </span>
        <span>
          <b style={{ color: "rgb(50, 255, 100)" }}>━</b> Throttle
        </span>
        <span>
          <b style={{ color: "rgb(80, 160, 255)" }}>━</b> Steering / cornering
        </span>
        <span>
          <b style={{ color: "rgb(160, 160, 160)" }}>━</b> Coasting
        </span>
        <span>
          <b style={{ color: "white" }}>●</b> Current car
        </span>
      </div>
    </div>
  );
}

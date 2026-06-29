import { useEffect, useMemo, useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getTelemetryColor(sample) {
  const brake = clamp(sample?.brake, 0, 1);
  const throttle = clamp(sample?.throttle, 0, 1);
  const steering = Math.abs(clamp(sample?.steering, -1, 1));

  // Priority: braking > throttle > steering > coasting
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

function solveAffineTransform(anchorPoints) {
  if (!Array.isArray(anchorPoints) || anchorPoints.length < 3) {
    return null;
  }

  const p1 = anchorPoints[0];
  const p2 = anchorPoints[1];
  const p3 = anchorPoints[2];

  const x1 = Number(p1.worldX);
  const y1 = Number(p1.worldZ);
  const x2 = Number(p2.worldX);
  const y2 = Number(p2.worldZ);
  const x3 = Number(p3.worldX);
  const y3 = Number(p3.worldZ);

  const u1 = Number(p1.imageX);
  const v1 = Number(p1.imageY);
  const u2 = Number(p2.imageX);
  const v2 = Number(p2.imageY);
  const u3 = Number(p3.imageX);
  const v3 = Number(p3.imageY);

  const det =
    x1 * (y2 - y3) -
    y1 * (x2 - x3) +
    x2 * y3 -
    x3 * y2;

  if (Math.abs(det) < 0.000001) {
    return null;
  }

  function solveFor(a1, a2, a3) {
    const A =
      (a1 * (y2 - y3) -
        y1 * (a2 - a3) +
        a2 * y3 -
        a3 * y2) /
      det;

    const B =
      (x1 * (a2 - a3) -
        a1 * (x2 - x3) +
        x2 * a3 -
        x3 * a2) /
      det;

    const C =
      (x1 * (y2 * a3 - a2 * y3) -
        y1 * (x2 * a3 - a2 * x3) +
        a1 * (x2 * y3 - x3 * y2)) /
      det;

    return { A, B, C };
  }

  const xTransform = solveFor(u1, u2, u3);
  const yTransform = solveFor(v1, v2, v3);

  return {
    worldToImage(worldX, worldZ) {
      return {
        x: xTransform.A * worldX + xTransform.B * worldZ + xTransform.C,
        y: yTransform.A * worldX + yTransform.B * worldZ + yTransform.C,
      };
    },
  };
}

function solveBoundsTransform(worldBounds, imageWidth, imageHeight) {
  if (!worldBounds) return null;

  const minX = Number(worldBounds.minX);
  const maxX = Number(worldBounds.maxX);
  const minZ = Number(worldBounds.minZ);
  const maxZ = Number(worldBounds.maxZ);

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  if (maxX === minX || maxZ === minZ) return null;

  return {
    worldToImage(worldX, worldZ) {
      const xNorm = (worldX - minX) / (maxX - minX);
      const zNorm = (worldZ - minZ) / (maxZ - minZ);

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

  // If there are only 2 points, draw a simple smooth line.
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

  // Soft glow layer
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

  // Main trail layer
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

export default function TrackTelemetryMap({
  apiBase,
  sessionId,
  trackKey,
  mapImageUrl = "/maps/singapore.png",
}) {
  const canvasRef = useRef(null);

  const [trackMap, setTrackMap] = useState(null);
  const [sessionMap, setSessionMap] = useState(null);
  const [trail, setTrail] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTrackMap() {
      try {
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
            const next = [...old, latest];
            return next.slice(-1200);
          });
        }
      } catch (err) {
        console.error(err);
        setError(err.message);
      }
    }

    fetchLivePosition();
    const interval = setInterval(fetchLivePosition, 250);

    return () => clearInterval(interval);
  }, [apiBase, sessionId]);

  const imageUrl = trackMap?.imageCalibration?.imageUrl || mapImageUrl;

  const imageWidth =
    trackMap?.imageCalibration?.imageWidth ||
    trackMap?.worldBounds?.widthPixels ||
    1200;

  const imageHeight =
    trackMap?.imageCalibration?.imageHeight ||
    trackMap?.worldBounds?.heightPixels ||
    800;

  const transform = useMemo(() => {
    const anchors = trackMap?.imageCalibration?.anchorPoints;

    const affine = solveAffineTransform(anchors);
    if (affine) return affine;

    return solveBoundsTransform(trackMap?.worldBounds, imageWidth, imageHeight);
  }, [trackMap, imageWidth, imageHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const image = new Image();

    image.src = imageUrl;

    image.onload = () => {
      const width = imageWidth || image.naturalWidth;
      const height = imageHeight || image.naturalHeight;

      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      if (!trackMap || !transform) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(20, 20, 560, 75);

        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText("Waiting for track map / calibration...", 36, 55);

        ctx.font = "13px Arial";
        ctx.fillText("Drive a lap, finalize the map, then add anchor points.", 36, 80);
        return;
      }

      // Draw reference centerline
      const centerline = Array.isArray(trackMap.centerline)
        ? trackMap.centerline
        : [];

      if (centerline.length > 1) {
        ctx.save();
        ctx.beginPath();

        let started = false;

        centerline.forEach((point) => {
          const worldX = point.x ?? point.worldX;
          const worldZ = point.z ?? point.worldZ;

          if (!hasNumber(worldX) || !hasNumber(worldZ)) return;

          const pos = transform.worldToImage(worldX, worldZ);

          if (!started) {
            ctx.moveTo(pos.x, pos.y);
            started = true;
          } else {
            ctx.lineTo(pos.x, pos.y);
          }
        });

        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.stroke();
        ctx.restore();
      }

      // Draw long smooth telemetry trail
      drawSmoothTelemetryTrail(ctx, trail, transform);

      // Draw live car marker
      const latest = sessionMap?.latestMapPosition;

      if (
        latest &&
        hasNumber(latest.worldX) &&
        hasNumber(latest.worldZ)
      ) {
        const pos = transform.worldToImage(latest.worldX, latest.worldZ);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.lineWidth = 4;
        ctx.strokeStyle = getTelemetryColor(latest);
        ctx.stroke();

        const speedText =
          latest.speedKph != null
            ? `${Math.round(latest.speedKph)} km/h`
            : "Live";

        drawTextBadge(ctx, speedText, pos.x + 12, pos.y - 12);
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

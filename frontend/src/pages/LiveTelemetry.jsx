import { useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  collection,
  getDocs,
} from "firebase/firestore";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { db } from "../firebase";
import TelemetryChart from "../components/TelemetryChart";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getTrackKeyFromSession(data) {
  if (data?.trackKey) return data.trackKey;
  if (data?.trackId != null) return `track_${data.trackId}`;
  return null;
}

function getTelemetryColor(sample) {
  const brake = clamp(sample?.brake, 0, 1);
  const throttle = clamp(sample?.throttle, 0, 1);
  const steering = Math.abs(clamp(sample?.steering, -1, 1));

  // Priority: braking > throttle > steering > coasting
  // Intensity is based on the actual telemetry value.
  if (brake > 0.05) {
    const r = Math.round(130 + brake * 125);
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

  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(x, y - height, width, height);

  ctx.fillStyle = "white";
  ctx.fillText(text, x + paddingX, y - paddingY);
}

function readCenterlinePoint(point) {
  const worldX = point.x ?? point.worldX;
  const worldZ = point.z ?? point.worldZ;

  if (!hasNumber(worldX) || !hasNumber(worldZ)) return null;

  return {
    worldX,
    worldZ,
  };
}

export default function LiveTelemetry({ sessionId }) {
  const canvasRef = useRef(null);

  const [selectedTelemetry, setSelectedTelemetry] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [trackMap, setTrackMap] = useState(null);
  const [centerline, setCenterline] = useState([]);
  const [trail, setTrail] = useState([]);
  const [speedPoints, setSpeedPoints] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setSelectedTelemetry(null);
      setSessionData(null);
      setTrackMap(null);
      setCenterline([]);
      setTrail([]);
      return;
    }

    const sessionRef = doc(db, "sessions", sessionId);

    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setSelectedTelemetry(null);
          setSessionData(null);
          return;
        }

        const data = snapshot.data();
        const latestTelemetry = data.latestTelemetry || null;
        const latestMapPosition = data.latestMapPosition || null;

        setSessionData(data);
        setSelectedTelemetry(latestTelemetry);

        if (latestTelemetry?.speedKph != null) {
          setSpeedPoints((prev) => {
            const next = [
              ...prev,
              {
                time: Date.now(),
                speed: Number(latestTelemetry.speedKph ?? 0),
              },
            ];
            return next.slice(-75);
          });
        }

        if (
          latestMapPosition &&
          hasNumber(latestMapPosition.worldX) &&
          hasNumber(latestMapPosition.worldZ)
        ) {
          setTrail((prev) => {
            const next = [...prev, latestMapPosition];
            return next.slice(-900);
          });
        }
      },
      (err) => {
        console.error("Session listener error:", err);
        setError(err.message || "Failed to load session.");
      }
    );

    return unsubscribe;
  }, [sessionId]);

  const activeTrackKey = useMemo(() => {
    return getTrackKeyFromSession(sessionData);
  }, [sessionData]);

  useEffect(() => {
    if (!activeTrackKey) {
      setTrackMap(null);
      setCenterline([]);
      return;
    }

    const trackRef = doc(db, "trackMaps", activeTrackKey);

    const unsubscribe = onSnapshot(
      trackRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          setTrackMap(null);
          setCenterline([]);
          return;
        }

        const data = snapshot.data();
        setTrackMap(data);

        try {
          const chunksRef = collection(
            db,
            "trackMaps",
            activeTrackKey,
            "centerlineChunks"
          );

          const chunksSnap = await getDocs(chunksRef);

          const chunks = chunksSnap.docs
            .map((d) => d.data())
            .filter((chunk) => {
              if (!data.centerlineVersion) return true;
              return chunk.version === data.centerlineVersion;
            })
            .sort((a, b) => {
              return (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0);
            });

          const points = [];
          for (const chunk of chunks) {
            if (Array.isArray(chunk.points)) {
              points.push(...chunk.points);
            }
          }

          setCenterline(points);
        } catch (err) {
          console.error("Failed to load centerline:", err);
        }
      },
      (err) => {
        console.error("Track map listener error:", err);
        setError(err.message || "Failed to load track map.");
      }
    );

    return unsubscribe;
  }, [activeTrackKey]);

  const chartData = useMemo(() => {
    return {
      labels: speedPoints.map(() => ""),
      datasets: [
        {
          label: "Speed (km/h)",
          data: speedPoints.map((p) => p.speed),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.5)",
        },
      ],
    };
  }, [speedPoints]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: { beginAtZero: true, max: 350 },
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: "#fff" },
        },
      },
    };
  }, []);

  const imageCalibration = trackMap?.imageCalibration || null;

  const imageUrl =
    imageCalibration?.imageUrl ||
    (activeTrackKey === "track_12"
      ? "/maps/singapore.png"
      : "/maps/default-track.png");

  const imageWidth = Number(imageCalibration?.imageWidth || 1200);
  const imageHeight = Number(imageCalibration?.imageHeight || 800);

  const transform = useMemo(() => {
    const affine = solveAffineTransform(imageCalibration?.anchorPoints);
    if (affine) return affine;

    // Fallback. This works, but is less accurate than anchor-point calibration.
    return solveBoundsTransform(trackMap?.worldBounds, imageWidth, imageHeight);
  }, [imageCalibration, trackMap, imageWidth, imageHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sessionId) return;

    const ctx = canvas.getContext("2d");
    const image = new Image();

    image.src = imageUrl;

    image.onload = () => {
      const width = imageWidth || image.naturalWidth;
      const height = imageHeight || image.naturalHeight;

      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);

      // Background map image
      ctx.drawImage(image, 0, 0, width, height);

      if (!transform) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(20, 20, 520, 70);
        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText("Waiting for track calibration / world bounds...", 36, 55);
        ctx.font = "13px Arial";
        ctx.fillText("Finalize the track map first, then add 3 image anchor points.", 36, 80);
        return;
      }

      // Draw centerline
      if (centerline.length > 1) {
        ctx.beginPath();

        let started = false;

        for (const point of centerline) {
          const readable = readCenterlinePoint(point);
          if (!readable) continue;

          const pos = transform.worldToImage(readable.worldX, readable.worldZ);

          if (!started) {
            ctx.moveTo(pos.x, pos.y);
            started = true;
          } else {
            ctx.lineTo(pos.x, pos.y);
          }
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.stroke();
      }

      // Draw trail
      for (const sample of trail) {
        if (!hasNumber(sample.worldX) || !hasNumber(sample.worldZ)) continue;

        const pos = transform.worldToImage(sample.worldX, sample.worldZ);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = getTelemetryColor(sample);
        ctx.fill();
      }

      // Draw live car
      const latest = sessionData?.latestMapPosition;

      if (
        latest &&
        hasNumber(latest.worldX) &&
        hasNumber(latest.worldZ)
      ) {
        const pos = transform.worldToImage(latest.worldX, latest.worldZ);
        const color = getTelemetryColor(latest);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.lineWidth = 4;
        ctx.strokeStyle = color;
        ctx.stroke();

        const speedText =
          latest.speedKph != null
            ? `${Math.round(latest.speedKph)} km/h`
            : "Live";

        drawTextBadge(ctx, speedText, pos.x + 12, pos.y - 12);
      }
    };

    image.onerror = () => {
      const width = imageWidth;
      const height = imageHeight;

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
    sessionId,
    sessionData,
    trail,
    centerline,
    transform,
    imageUrl,
    imageWidth,
    imageHeight,
  ]);

  return (
    <div className="page-container">
      <h1>
        Live <span className="text-blue">Telemetry</span>
      </h1>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      <div className="grid-2" style={{ marginBottom: "20px" }}>
        <div
          className="card"
          style={{ borderLeftColor: "var(--color-accent-blue)" }}
        >
          <h2>Current Stats</h2>

          {selectedTelemetry ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              <p>
                <strong>Speed:</strong> {selectedTelemetry.speedKph ?? 0} km/h
              </p>
              <p>
                <strong>Gear:</strong> {selectedTelemetry.gear ?? "-"}
              </p>
              <p>
                <strong>RPM:</strong> {selectedTelemetry.rpm ?? 0}
              </p>
              <p>
                <strong>Throttle:</strong>{" "}
                {((selectedTelemetry.throttle ?? 0) * 100).toFixed(0)}%
              </p>
              <p>
                <strong>Brake:</strong>{" "}
                {((selectedTelemetry.brake ?? 0) * 100).toFixed(0)}%
              </p>
              <p>
                <strong>Steering:</strong>{" "}
                {(selectedTelemetry.steering ?? 0).toFixed(2)}
              </p>
              <p>
                <strong>DRS:</strong> {selectedTelemetry.drs ? "On" : "Off"}
              </p>
              <p>
                <strong>Lap:</strong> {selectedTelemetry.lapNumber ?? "-"}
              </p>
              <p>
                <strong>World X:</strong>{" "}
                {sessionData?.latestMapPosition?.worldX?.toFixed?.(2) ?? "-"}
              </p>
              <p>
                <strong>World Z:</strong>{" "}
                {sessionData?.latestMapPosition?.worldZ?.toFixed?.(2) ?? "-"}
              </p>
            </div>
          ) : (
            <p>Waiting for telemetry data or session ID...</p>
          )}
        </div>

        <div
          className="card"
          style={{ borderLeftColor: "var(--color-accent-blue)" }}
        >
          <h2>Map Status</h2>
          <p>
            <strong>Session:</strong> {sessionId || "-"}
          </p>
          <p>
            <strong>Track Key:</strong> {activeTrackKey || "-"}
          </p>
          <p>
            <strong>World Position:</strong>{" "}
            {sessionData?.latestMapPosition ? "Receiving" : "Not received"}
          </p>
          <p>
            <strong>Calibration:</strong>{" "}
            {imageCalibration?.anchorPoints?.length >= 3
              ? "Anchor calibrated"
              : trackMap?.worldBounds
              ? "Bounds fallback"
              : "Missing"}
          </p>
          <p>
            <strong>Trail Points:</strong> {trail.length}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "20px" }}>
        <h2>Live Track Map</h2>

        <div
          style={{
            marginTop: "12px",
            width: "100%",
            overflowX: "auto",
          }}
        >
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
            <b style={{ color: "rgb(255, 60, 60)" }}>●</b> Brake
          </span>
          <span>
            <b style={{ color: "rgb(50, 255, 100)" }}>●</b> Throttle
          </span>
          <span>
            <b style={{ color: "rgb(80, 160, 255)" }}>●</b> Steering / cornering
          </span>
          <span>
            <b style={{ color: "rgb(160, 160, 160)" }}>●</b> Coasting
          </span>
          <span>
            <b style={{ color: "white" }}>●</b> Current car
          </span>
        </div>
      </div>

      <div className="card">
        <h2>Speed Trace</h2>
        <div style={{ height: "400px", width: "100%", marginTop: "16px" }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="card" style={{ marginTop: "20px" }}>
        <h2>Session History</h2>
        <p>Review telemetry from the selected session.</p>
        <div style={{ marginTop: "20px", maxHeight: "400px", overflowY: "auto" }}>
          <TelemetryChart sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}

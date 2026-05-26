import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
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
  Filler,
  Tooltip,
  Legend
);

function SteeringWheel({ steering = 0 }) {
  const clamped = Math.max(-1, Math.min(1, Number(steering) || 0));
  const angle = clamped * 180;

  return (
    <div
      style={{
        height: "320px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >

      <div
        style={{
          width: "180px",
          height: "180px",
          borderRadius: "50%",
          border: "12px solid #d1d5db",
          position: "relative",
          boxShadow: "0 0 0 8px rgba(255,255,255,0.04) inset",
          transform: `rotate(${angle}deg)`,
          transition: "transform 80ms linear",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "#fff",
            transform: "translate(-50%, -50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "110px",
            height: "6px",
            background: "#d1d5db",
            transform: "translate(-50%, -50%)",
            borderRadius: "999px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "6px",
            height: "110px",
            background: "#d1d5db",
            transform: "translate(-50%, -50%)",
            borderRadius: "999px",
          }}
        />
      </div>

      <div style={{ textAlign: "center", marginTop: "8px", fontSize: "18px" }}>
        <strong>{angle.toFixed(0)}°</strong>
      </div>
    </div>
  );
}

export default function LiveTelemetry({ sessionId }) {
  const [selectedTelemetry, setSelectedTelemetry] = useState(null);
  const [speedPoints, setSpeedPoints] = useState([]);
  const [throttlePoints, setThrottlePoints] = useState([]);
  const [brakePoints, setBrakePoints] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setSelectedTelemetry(null);
      return;
    }

    const sessionRef = doc(db, "sessions", sessionId);

    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setSelectedTelemetry(null);
          return;
        }

        const data = snapshot.data();
        const telemetry = data.latestTelemetry || null;
        setSelectedTelemetry(telemetry);

        if (telemetry?.speedKph != null) {
          setSpeedPoints((prev) => {
            const next = [
              ...prev,
              {
                time: Date.now(),
                speed: Number(telemetry.speedKph ?? 0),
              },
            ];
            return next.slice(-75);
          });
        }

        if (telemetry?.throttle != null || telemetry?.brake != null) {
          const now = Date.now();

          setThrottlePoints((prev) => {
            const next = [
              ...prev,
              { time: now, value: Number(telemetry.throttle ?? 0) * 100 },
            ];
            return next.slice(-75);
          });

          setBrakePoints((prev) => {
            const next = [
              ...prev,
              { time: now, value: Number(telemetry.brake ?? 0) * 100 },
            ];
            return next.slice(-75);
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
          labels: { color: "#fff" }
        },
      },
    };
  }, []);

  const throttleData = useMemo(() => {
    return {
      labels: throttlePoints.map(() => ""),
      datasets: [
        {
          label: "Throttle (%)",
          data: throttlePoints.map((p) => p.value),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.15)",
          fill: true,
        },
      ],
    };
  }, [throttlePoints]);

  const brakeData = useMemo(() => {
    return {
      labels: brakePoints.map(() => ""),
      datasets: [
        {
          label: "Brake (%)",
          data: brakePoints.map((p) => p.value),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          fill: true,
        },
      ],
    };
  }, [brakePoints]);

  const percentOptions = useMemo(() => {
    return {
      responsive: true,
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: "#aaa", callback: (v) => `${v}%` },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: "#fff" },
        },
      },
    };
  }, []);

  return (
    <div className="page-container">
      <h1>Live <span className="text-blue">Telemetry</span></h1>
      
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      
      <div className="grid-2" style={{ marginBottom: "20px" }}>
        <div className="card" style={{ borderLeftColor: "var(--color-accent-blue)" }}>
          <h2>Current Stats</h2>
          {selectedTelemetry ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <p><strong>Speed:</strong> {selectedTelemetry.speedKph ?? 0} km/h</p>
              <p><strong>Gear:</strong> {selectedTelemetry.gear ?? "-"}</p>
              <p><strong>RPM:</strong> {selectedTelemetry?.rpm ?? selectedTelemetry?.engineRPM ?? "-"}</p>
              <p><strong>Throttle:</strong> {((selectedTelemetry.throttle ?? 0) * 100).toFixed(0)}%</p>
              <p><strong>Brake:</strong> {((selectedTelemetry.brake ?? 0) * 100).toFixed(0)}%</p>
              <p><strong>Steering:</strong> {(selectedTelemetry.steering ?? 0).toFixed(2)}</p>
              <p><strong>DRS:</strong> {selectedTelemetry.drs ? "On" : "Off"}</p>
              <p><strong>Lap:</strong> {selectedTelemetry.lapNumber ?? "-"}</p>
              <p><strong>Sector:</strong> {selectedTelemetry.currentSector != null ? selectedTelemetry.currentSector + 1 : "-"}</p>
            </div>
          ) : (
            <p>Waiting for telemetry data or session ID...</p>
          )}
        </div>
      
        <div className="card" style={{ borderLeftColor: "var(--color-accent-blue)" }}>
          <h2>Steering Wheel</h2>
          <SteeringWheel steering={selectedTelemetry?.steering ?? 0} />
        </div>
      </div>

      <div className="card">
        <h2>Speed Trace</h2>
        <div style={{ height: "400px", width: "100%", marginTop: "16px" }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h2>Throttle Application</h2>
        <div style={{ height: "300px", width: "100%", marginTop: "16px" }}>
          <Line data={throttleData} options={percentOptions} />
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h2>Brake Application</h2>
        <div style={{ height: "300px", width: "100%", marginTop: "16px" }}>
          <Line data={brakeData} options={percentOptions} />
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h2>Lap Times</h2>
        <p style={{ color: '#888', fontSize: '13px', marginBottom: '12px' }}>Sector and lap times update as you complete each lap.</p>
        <TelemetryChart sessionId={sessionId} />
      </div>
    </div>
  );
}

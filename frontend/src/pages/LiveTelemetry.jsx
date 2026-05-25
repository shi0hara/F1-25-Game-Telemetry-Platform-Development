import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
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

export default function LiveTelemetry({ sessionId }) {
  const [selectedTelemetry, setSelectedTelemetry] = useState(null);
  const [speedPoints, setSpeedPoints] = useState([]);
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
        setSelectedTelemetry(data.latestTelemetry || null);

        if (data.latestTelemetry?.speedKph != null) {
          setSpeedPoints((prev) => {
            const next = [
              ...prev,
              {
                time: Date.now(),
                speed: Number(data.latestTelemetry.speedKph ?? 0),
              },
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

  return (
    <div className="page-container">
      <h1>Live <span className="text-blue">Telemetry</span></h1>
      
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      
      <div className="grid-2" style={{ marginBottom: "20px" }}>
        <div className="card" style={{ borderLeftColor: 'var(--color-accent-blue)' }}>
          <h2>Current Stats</h2>
          {selectedTelemetry ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <p><strong>Speed:</strong> {selectedTelemetry.speedKph ?? 0} km/h</p>
              <p><strong>Gear:</strong> {selectedTelemetry.gear ?? "-"}</p>
              <p><strong>RPM:</strong> {selectedTelemetry.rpm ?? 0}</p>
              <p><strong>Throttle:</strong> {((selectedTelemetry.throttle ?? 0) * 100).toFixed(0)}%</p>
              <p><strong>Brake:</strong> {((selectedTelemetry.brake ?? 0) * 100).toFixed(0)}%</p>
              <p><strong>Steering:</strong> {(selectedTelemetry.steering ?? 0).toFixed(2)}</p>
              <p><strong>DRS:</strong> {selectedTelemetry.drs ? "On" : "Off"}</p>
              <p><strong>Lap:</strong> {selectedTelemetry.lapNumber ?? "-"}</p>
            </div>
          ) : (
            <p>Waiting for telemetry data or session ID...</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Speed Trace</h2>
        <div style={{ height: "400px", width: "100%", marginTop: "16px" }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h2>Session History</h2>
        <p>Review telemetry from the selected session.</p>
        <div style={{ marginTop: '20px', maxHeight: '400px', overflowY: 'auto' }}>
          <TelemetryChart sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
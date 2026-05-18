import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
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
import useTelemetrySamples from "../hooks/useTelemetrySamples";
import { getLiveDeltaToPB } from "../utils/timeTrialDelta";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

export default function LiveTelemetry() {
  const [telemetry, setTelemetry] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");
  const [speedPoints, setSpeedPoints] = useState([]);
  const [throttlePoints, setThrottlePoints] = useState([]);
  const [brakePoints, setBrakePoints] = useState([]);
  const samples = useTelemetrySamples(sessionId);

  useEffect(() => {
    let isMounted = true;

    const handleUnhandledRejection = (event) => {
    if (
      event.reason?.name === "AbortError" ||
      event.reason?.message?.includes("signal is aborted") ||
      event.reason?.message?.includes("user aborted")
    ) {
      event.preventDefault();
    }
  };
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

    const q = query(
      collection(db, "sessions"),
      orderBy("startedAt", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMounted) return;
        if (snapshot.empty) {
          setError("No sessions found.");
          setTelemetry(null);
          setSessionId("");
          setSpeedPoints([]);
          setThrottlePoints([]);
          setBrakePoints([]);
          return;
        }

        const sessionDoc = snapshot.docs[0];
        const data = sessionDoc.data();

        setSessionId(sessionDoc.id);

        if (!data.latestTelemetry) {
          setError("Session found, but latestTelemetry is missing.");
          setTelemetry(null);
          return;
        }

        const t = data.latestTelemetry;

        setError("");
        setTelemetry(t);

        setSpeedPoints((prev) => {
          const next = [
            ...prev,
            {
              time: Date.now(),
              speed: Number(t.speedKph ?? 0),
            },
          ];
          return next.slice(-75);
        });

        setThrottlePoints((prev) => {
          const next = [
            ...prev,
            {
              time: Date.now(),
              throttle: Number((t.throttle ?? 0) * 100),
            },
          ];
          return next.slice(-75);
        });

        setBrakePoints((prev) => {
          const next = [
            ...prev,
            {
              time: Date.now(),
              brake: Number((t.brake ?? 0) * 100),
            },
          ];
          return next.slice(-75);
        });
      },
      (err) => {
        if (!isMounted) return;
        if (err.name === "AbortError" || err.code === "cancelled") return;
        console.error("Firestore listener error:", err);
        setError(err.message);
      }
    );

    return () => {
      isMounted = false;
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      unsubscribe();
    };
  }, []);

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
        },
      ],
    };
  }, [speedPoints]);

  const throttleChartData = useMemo(() => {
    return {
      labels: throttlePoints.map(() => ""),
      datasets: [
        {
          label: "Throttle (%)",
          data: throttlePoints.map((p) => p.throttle),
          borderColor: "#ff9800",
          backgroundColor: "rgba(255, 152, 0, 0.1)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    };
  }, [throttlePoints]);

  const brakeChartData = useMemo(() => {
    return {
      labels: brakePoints.map(() => ""),
      datasets: [
        {
          label: "Brake (%)",
          data: brakePoints.map((p) => p.brake),
          borderColor: "#f44336",
          backgroundColor: "rgba(244, 67, 54, 0.1)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    };
  }, [brakePoints]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: { beginAtZero: true },
      },
      plugins: {
        legend: {
          display: true,
        },
      },
    };
  }, []);

  const deltaToPB = useMemo(() => {
    return getLiveDeltaToPB(samples, telemetry);
  }, [samples, telemetry]);

  if (!telemetry) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Live Telemetry</h2>
        {sessionId && <p>Session ID: {sessionId}</p>}
        {error && <p style={{ color: "red" }}>Error: {error}</p>}
        <p>Waiting for telemetry...</p>

        <div style={{ height: 300, marginTop: 16 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Live Telemetry</h2>

      <p>Session ID: {sessionId}</p>
      <p>Speed: {telemetry.speedKph ?? 0} km/h</p>
      <p>Throttle: {((telemetry.throttle ?? 0) * 100).toFixed(0)}%</p>
      <p>Brake: {((telemetry.brake ?? 0) * 100).toFixed(0)}%</p>
      <p>Steering: {(telemetry.steering ?? 0).toFixed(2)}</p>
      <p>Gear: {telemetry.gear ?? "-"}</p>
      <p>RPM: {telemetry.rpm ?? 0}</p>
      <p>DRS: {telemetry.drs ? "On" : "Off"}</p>
      <p>Lap: {telemetry.lapNumber ?? "-"}</p>
      <p>Delta to PB: {deltaToPB.formatted}</p>
      <p style={{ color: "#666" }}>
        Delta source: {deltaToPB.source === "packet-trace" ? "Packet 2 PB ghost trace" : "latest telemetry fallback"}
      </p>
      <p>
        Cornering Speed:{" "}
        {telemetry.corneringSpeed == null
          ? "Not calculated yet"
          : `${telemetry.corneringSpeed} km/h`}
      </p>
      <p>
        Braking Distance:{" "}
        {telemetry.brakingDistance == null
          ? "Not calculated yet"
          : `${telemetry.brakingDistance} m`}
      </p>
      <p>Last Updated: {telemetry.timestamp ?? "-"}</p>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20, marginTop: 30 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>Speed (km/h)</h3>
          <div style={{ height: 300 }}>
            <Line data={chartData} options={chartOptions} />
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: "#666", margin: "12px 0 0 0" }}>
            Current: <strong>{(telemetry.speedKph ?? 0).toFixed(1)}</strong> km/h
          </p>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: "#ff9800" }}>Throttle (%)</h3>
          <div style={{ height: 300 }}>
            <Line data={throttleChartData} options={chartOptions} />
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: "#666", margin: "12px 0 0 0" }}>
            Current: <strong>{((telemetry.throttle ?? 0) * 100).toFixed(0)}</strong>%
          </p>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: "#f44336" }}>Brake (%)</h3>
          <div style={{ height: 300 }}>
            <Line data={brakeChartData} options={chartOptions} />
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: "#666", margin: "12px 0 0 0" }}>
            Current: <strong>{((telemetry.brake ?? 0) * 100).toFixed(0)}</strong>%
          </p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
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
      <p>Delta to PB: {telemetry.deltaToPB ?? "-"} ms</p>
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

      <div style={{ height: 320, marginTop: 16 }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

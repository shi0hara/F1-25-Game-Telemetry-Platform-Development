import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

export default function LiveTelemetry() {
  const [usernameInput, setUsernameInput] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");
  const [speedPoints, setSpeedPoints] = useState([]);

  const resolveUser = async (e) => {
    e.preventDefault();
    setError("");
    setResolvedUser(null);
    setTelemetry(null);
    setSessionId("");
    setSpeedPoints([]);

    const username = usernameInput.trim().toLowerCase();
    if (!username) {
      setError("Enter a username.");
      return;
    }

    try {
      const q = query(
        collection(db, "users"),
        where("usernameLower", "==", username),
        limit(1)
      );

      const snap = await getDocs(q);
      if (snap.empty) {
        setError("No user found for that username.");
        return;
      }

      const docSnap = snap.docs[0];
      setResolvedUser({ id: docSnap.id, ...docSnap.data() });
    } catch (err) {
      console.error("User resolve error:", err);
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!resolvedUser?.id) return;

    const q = query(
      collection(db, "sessions"),
      where("userId", "==", resolvedUser.id),
      orderBy("startedAt", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setError("User found, but no sessions yet.");
          setTelemetry(null);
          setSessionId("");
          return;
        }

        const sessionDoc = snapshot.docs[0];
        const data = sessionDoc.data();

        setSessionId(sessionDoc.id);

        if (!data.latestTelemetry) {
          setError("Latest telemetry is missing for the newest session.");
          setTelemetry(null);
          return;
        }

        setError("");
        setTelemetry(data.latestTelemetry);

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
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setError(err.message);
      }
    );

    return unsubscribe;
  }, [resolvedUser?.id]);

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

  return (
    <div style={{ padding: 16 }}>
      <h2>Live Telemetry</h2>

      <form onSubmit={resolveUser} style={{ marginBottom: 16 }}>
        <input
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="Enter username"
          style={{ padding: 8, width: 240, marginRight: 8 }}
        />
        <button type="submit">Load user</button>
      </form>

      {resolvedUser && (
        <p>
          Viewing: {resolvedUser.username}
          {resolvedUser.email ? ` (${resolvedUser.email})` : ""}
        </p>
      )}

      {sessionId && <p>Session ID: {sessionId}</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!telemetry ? (
        <p>Waiting for telemetry...</p>
      ) : (
        <>
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
        </>
      )}

      <div style={{ height: 320, marginTop: 16 }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

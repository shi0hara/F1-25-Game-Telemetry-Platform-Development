import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
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

function formatDate(value) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value?.toDate?.() || new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatLapTime(ms) {
  if (ms == null) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const fraction = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
    .toString()
    .padStart(3, "0")}`;
}

export default function LiveTelemetry() {
  const [usernameInput, setUsernameInput] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedTelemetry, setSelectedTelemetry] = useState(null);
  const [error, setError] = useState("");
  const [speedPoints, setSpeedPoints] = useState([]);

  const resolveUser = async (e) => {
    e.preventDefault();
    setError("");
    setResolvedUser(null);
    setSessions([]);
    setSelectedSession(null);
    setSelectedTelemetry(null);
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

      const userDoc = snap.docs[0];
      const userData = userDoc.data();

      setResolvedUser({
        id: userDoc.id,
        ...userData,
      });
    } catch (err) {
      console.error("User resolve error:", err);
      setError(err.message || "Failed to resolve user.");
    }
  };

  useEffect(() => {
    if (!resolvedUser?.id) return;

    const q = query(
      collection(db, "sessions"),
      where("userId", "==", resolvedUser.id),
      orderBy("startedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextSessions = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setSessions(nextSessions);

        if (nextSessions.length === 0) {
          setSelectedSession(null);
          setSelectedTelemetry(null);
          setError("User found, but no sessions yet.");
          return;
        }

        setError("");

        setSelectedSession((prev) => {
          if (!prev) return nextSessions[0];
          const match = nextSessions.find((s) => s.id === prev.id);
          return match || nextSessions[0];
        });
      },
      (err) => {
        console.error("Sessions listener error:", err);
        setError(err.message || "Failed to load sessions.");
      }
    );

    return unsubscribe;
  }, [resolvedUser?.id]);

  useEffect(() => {
    if (!selectedSession?.id) {
      setSelectedTelemetry(null);
      return;
    }

    const sessionRef = doc(db, "sessions", selectedSession.id);

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
        setError(err.message || "Failed to load selected session.");
      }
    );

    return unsubscribe;
  }, [selectedSession?.id]);

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
          Viewing: <strong>{resolvedUser.username}</strong>
          {resolvedUser.email ? ` (${resolvedUser.email})` : ""}
        </p>
      )}

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {resolvedUser && (
        <>
          <h3>Sessions</h3>

          {sessions.length === 0 ? (
            <p>No sessions found.</p>
          ) : (
            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {sessions.map((session) => {
                const isSelected = selectedSession?.id === session.id;
                const summary = session.processedSummary || {};

                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      setSelectedSession(session);
                      setSelectedTelemetry(session.latestTelemetry || null);
                      setSpeedPoints([]);
                    }}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      border: isSelected ? "2px solid #333" : "1px solid #ccc",
                      borderRadius: 8,
                      background: isSelected ? "#f2f2f2" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <div><strong>{session.trackName || "Unknown Track"}</strong></div>
                    <div>Session Type: {session.sessionType ?? "-"}</div>
                    <div>Started: {formatDate(session.startedAt)}</div>
                    <div>Ended: {formatDate(session.endedAt)}</div>
                    <div>
                      Best Lap: {formatLapTime(summary.bestLapTimeMs)}
                    </div>
                    <div>Top Speed: {summary.topSpeedKph ?? 0} km/h</div>
                    <div>Total Laps: {summary.totalLaps ?? 0}</div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedSession && (
        <>
          <h3>Selected Session</h3>
          <p>Session ID: {selectedSession.id}</p>
          <p>Track: {selectedSession.trackName ?? "-"}</p>
          <p>Started: {formatDate(selectedSession.startedAt)}</p>
          <p>Ended: {formatDate(selectedSession.endedAt)}</p>

          {selectedTelemetry ? (
            <>
              <p>Speed: {selectedTelemetry.speedKph ?? 0} km/h</p>
              <p>Throttle: {((selectedTelemetry.throttle ?? 0) * 100).toFixed(0)}%</p>
              <p>Brake: {((selectedTelemetry.brake ?? 0) * 100).toFixed(0)}%</p>
              <p>Steering: {(selectedTelemetry.steering ?? 0).toFixed(2)}</p>
              <p>Gear: {selectedTelemetry.gear ?? "-"}</p>
              <p>RPM: {selectedTelemetry.rpm ?? 0}</p>
              <p>DRS: {selectedTelemetry.drs ? "On" : "Off"}</p>
              <p>Lap: {selectedTelemetry.lapNumber ?? "-"}</p>
              <p>Delta to PB: {selectedTelemetry.deltaToPB ?? "-"} ms</p>
              <p>
                Cornering Speed:{" "}
                {selectedTelemetry.corneringSpeed == null
                  ? "Not calculated yet"
                  : `${selectedTelemetry.corneringSpeed} km/h`}
              </p>
              <p>
                Braking Distance:{" "}
                {selectedTelemetry.brakingDistance == null
                  ? "Not calculated yet"
                  : `${selectedTelemetry.brakingDistance} m`}
              </p>
              <p>Last Updated: {selectedTelemetry.timestamp ?? "-"}</p>
            </>
          ) : (
            <p>No latest telemetry for this session yet.</p>
          )}

          <div style={{ height: 320, marginTop: 16 }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </>
      )}
    </div>
  );
}

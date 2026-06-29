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
import TrackTelemetryMap from "../components/TrackTelemetryMap";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function formatDate(value) {
  if (!value) return "-";
  const d =
    typeof value === "string"
      ? new Date(value)
      : value?.toDate?.() || new Date(value);

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

function getTrackKey(session) {
  if (session?.trackKey) return session.trackKey;
  if (session?.trackId != null) return `track_${session.trackId}`;
  return null;
}

function getDefaultMapImage(trackKey) {
  const mapImages = {
    track_0: "/maps/albert-park.svg",
    track_12: "/maps/singapore.png",
    track_11: "/maps/monza.png",
    track_13: "/maps/suzuka.png",
  };

  return mapImages[trackKey] || "/maps/default-track.png";
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
        const latestTelemetry = data.latestTelemetry || null;

        setSelectedSession((prev) => ({
          ...(prev || {}),
          id: selectedSession.id,
          ...data,
        }));

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
      },
      (err) => {
        console.error("Session listener error:", err);
        setError(err.message || "Failed to load selected session.");
      }
    );

    return unsubscribe;
  }, [selectedSession?.id]);

  const activeTrackKey = useMemo(() => {
    return getTrackKey(selectedSession);
  }, [selectedSession]);

  const mapImageUrl = useMemo(() => {
    return getDefaultMapImage(activeTrackKey);
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
        x: {
          display: false,
        },
        y: {
          beginAtZero: true,
          max: 350,
          ticks: {
            color: "#fff",
          },
          grid: {
            color: "rgba(255,255,255,0.12)",
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#fff",
          },
        },
      },
    };
  }, []);

  return (
    <div className="page-container">
      <h1>
        Live <span className="text-blue">Telemetry</span>
      </h1>

      <form onSubmit={resolveUser} style={{ marginBottom: 16 }}>
        <input
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="Enter username"
          style={{
            padding: 8,
            width: 240,
            marginRight: 8,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.2)",
          }}
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
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Sessions</h2>

          {sessions.length === 0 ? (
            <p>No sessions found.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
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
                      border: isSelected
                        ? "2px solid var(--color-accent-blue)"
                        : "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 8,
                      background: isSelected
                        ? "rgba(59,130,246,0.16)"
                        : "rgba(255,255,255,0.04)",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <strong>{session.trackName || "Unknown Track"}</strong>
                    </div>
                    <div>Track Key: {getTrackKey(session) || "-"}</div>
                    <div>Session Type: {session.sessionType ?? "-"}</div>
                    <div>Started: {formatDate(session.startedAt)}</div>
                    <div>Ended: {formatDate(session.endedAt)}</div>
                    <div>Best Lap: {formatLapTime(summary.bestLapTimeMs)}</div>
                    <div>Top Speed: {summary.topSpeedKph ?? 0} km/h</div>
                    <div>Total Laps: {summary.totalLaps ?? 0}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedSession && (
        <>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <h2>Selected Session</h2>
              <p>
                <strong>Session ID:</strong> {selectedSession.id}
              </p>
              <p>
                <strong>Track:</strong> {selectedSession.trackName ?? "-"}
              </p>
              <p>
                <strong>Track Key:</strong> {activeTrackKey ?? "-"}
              </p>
              <p>
                <strong>Started:</strong> {formatDate(selectedSession.startedAt)}
              </p>
              <p>
                <strong>Ended:</strong> {formatDate(selectedSession.endedAt)}
              </p>
            </div>

            <div className="card">
              <h2>Current Telemetry</h2>

              {selectedTelemetry ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
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
                    <strong>Delta to PB:</strong>{" "}
                    {selectedTelemetry.deltaToPB ?? "-"} ms
                  </p>
                  <p>
                    <strong>Cornering Speed:</strong>{" "}
                    {selectedTelemetry.corneringSpeed == null
                      ? "-"
                      : `${selectedTelemetry.corneringSpeed} km/h`}
                  </p>
                  <p>
                    <strong>Braking Distance:</strong>{" "}
                    {selectedTelemetry.brakingDistance == null
                      ? "-"
                      : `${Number(selectedTelemetry.brakingDistance).toFixed(1)} m`}
                  </p>
                  <p>
                    <strong>World X:</strong>{" "}
                    {selectedSession.latestMapPosition?.worldX?.toFixed?.(2) ??
                      selectedTelemetry.worldX?.toFixed?.(2) ??
                      "-"}
                  </p>
                  <p>
                    <strong>World Z:</strong>{" "}
                    {selectedSession.latestMapPosition?.worldZ?.toFixed?.(2) ??
                      selectedTelemetry.worldZ?.toFixed?.(2) ??
                      "-"}
                  </p>
                </div>
              ) : (
                <p>No latest telemetry for this session yet.</p>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Telemetry Map</h2>

            {activeTrackKey ? (
              <TrackTelemetryMap
                apiBase={API_BASE}
                sessionId={selectedSession.id}
                trackKey={activeTrackKey}
                mapImageUrl={mapImageUrl}
              />
            ) : (
              <p>No track key found for this session.</p>
            )}
          </div>

          <div className="card">
            <h2>Speed Trace</h2>
            <div style={{ height: 320, marginTop: 16 }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

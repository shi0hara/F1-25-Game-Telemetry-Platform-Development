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
import TrackTelemetryMap from "../components/TrackTelemetryMap";
import TelemetryChart from "../components/TelemetryChart";
import SteeringWheel from "../components/SteeringWheel";
import useActiveSession from "../hooks/useActiveSession";

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

function createEmptyMapTrailState() {
  return {
    currentLapNumber: null,
    currentPointCount: 0,
    completedLapTrails: [],
    historyLoading: false,
    options: [],
  };
}

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
    track_0: "/maps/albert-park.png",
    track_12: "/maps/singapore.png",
    track_11: "/maps/monza.png",
    track_13: "/maps/suzuka.png",
  };

  return mapImages[trackKey] || "/maps/default-track.png";
}

function LapTrailSelector({ options, selectedKey, onSelect, loading = false }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: "12px",
        alignItems: "center",
      }}
    >
      {options.map((option) => {
        const selected = selectedKey === option.key;
        const isCurrent = option.type === "current";

        return (
          <button
            type="button"
            key={option.key}
            onClick={() => onSelect(option.key)}
            title={`${option.pointCount ?? 0} map points`}
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              border: selected
                ? `2px solid ${
                    isCurrent
                      ? "var(--color-accent-blue)"
                      : "var(--color-accent-green)"
                  }`
                : "1px solid rgba(255,255,255,0.18)",
              background: selected
                ? isCurrent
                  ? "rgba(59,130,246,0.18)"
                  : "rgba(34,197,94,0.16)"
                : "rgba(255,255,255,0.05)",
              color: "white",
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}

      {options.length === 1 && (
        <span style={{ color: "#aaa", fontSize: "14px" }}>
          {loading
            ? "Loading lap tabs..."
            : "Lap tabs appear when saved telemetry points are found."}
        </span>
      )}
    </div>
  );
}

export default function LiveTelemetry({ currentUser }) {
  const isAdmin =
    currentUser?.isAdmin === true || currentUser?.role === "admin";
  const ownUsername = currentUser?.username || "";
  const [sessionScope, setSessionScope] = useState("mine");
  const activeUsername =
    isAdmin && sessionScope === "all" ? "" : ownUsername;
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedTelemetry, setSelectedTelemetry] = useState(null);
  const [speedPoints, setSpeedPoints] = useState([]);
  const [selectedTrailKey, setSelectedTrailKey] = useState("current");
  const [mapTrailState, setMapTrailState] = useState(() =>
    createEmptyMapTrailState()
  );
  const [localError, setLocalError] = useState("");

  const {
    sessionId: autoSessionId,
    sessionData: autoSessionData,
    sessions,
    userData,
    loading,
    error,
  } = useActiveSession(activeUsername);

  useEffect(() => {
    if (!autoSessionId) {
      setSelectedSessionId(null);
      setSelectedSession(null);
      setSelectedTelemetry(null);
      setSpeedPoints([]);
      setSelectedTrailKey("current");
      setMapTrailState(createEmptyMapTrailState());
      return;
    }

    setSelectedSessionId((prev) => {
      if (prev && sessions.some((session) => session.id === prev)) {
        return prev;
      }

      return autoSessionId;
    });
  }, [autoSessionId, sessions]);

  useEffect(() => {
    setSelectedTrailKey("current");
    setMapTrailState(createEmptyMapTrailState());
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSession(null);
      setSelectedTelemetry(null);
      return undefined;
    }

    const sessionRef = doc(db, "sessions", selectedSessionId);

    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setSelectedSession(null);
          setSelectedTelemetry(null);
          return;
        }

        const data = {
          id: snapshot.id,
          ...snapshot.data(),
        };

        setSelectedSession(data);

        const latestTelemetry = data.latestTelemetry || null;
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
        console.error("Selected session listener error:", err);
        setLocalError(err.message || "Failed to load selected session.");
      }
    );

    return unsubscribe;
  }, [selectedSessionId]);

  function resetLapSelection() {
    setSelectedTrailKey("current");
    setMapTrailState(createEmptyMapTrailState());
  }

  function switchSessionScope(nextScope) {
    if (nextScope === "all" && !isAdmin) return;

    setLocalError("");
    setSpeedPoints([]);
    setSelectedSessionId(null);
    setSelectedSession(null);
    setSelectedTelemetry(null);
    resetLapSelection();
    setSessionScope(nextScope);
  }

  const activeTrackKey = useMemo(() => {
    return getTrackKey(selectedSession || autoSessionData);
  }, [selectedSession, autoSessionData]);

  const mapImageUrl = useMemo(() => {
    return getDefaultMapImage(activeTrackKey);
  }, [activeTrackKey]);

  const lapOptions = useMemo(() => {
    if (mapTrailState.options.length > 0) {
      return mapTrailState.options;
    }

    return [
      {
        key: "current",
        type: "current",
        lapNumber: null,
        label: "Current Lap Trail",
        pointCount: 0,
      },
    ];
  }, [mapTrailState]);

  const selectedLapOption = useMemo(() => {
    return (
      lapOptions.find((option) => option.key === selectedTrailKey) ||
      lapOptions[0]
    );
  }, [lapOptions, selectedTrailKey]);

  const activeTrailKey = selectedLapOption?.key || "current";
  const selectedLapNumber = selectedLapOption?.lapNumber ?? null;

  const chartData = useMemo(() => {
    return {
      labels: speedPoints.map(() => ""),
      datasets: [
        {
          label: "Live Speed (km/h)",
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

  const shownError = localError || error;

  return (
    <div className="page-container">
      <h1>
        Live <span className="text-blue">Telemetry</span>
      </h1>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => switchSessionScope("mine")}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border:
              sessionScope === "mine"
                ? "1px solid var(--color-accent-green)"
                : "1px solid rgba(255,255,255,0.18)",
            background:
              sessionScope === "mine"
                ? "rgba(34,197,94,0.16)"
                : "rgba(255,255,255,0.05)",
            color: "white",
            cursor: "pointer",
          }}
        >
          My sessions
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => switchSessionScope("all")}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border:
                sessionScope === "all"
                  ? "1px solid var(--color-accent-yellow)"
                  : "1px solid rgba(255,255,255,0.18)",
              background:
                sessionScope === "all"
                  ? "rgba(250,204,21,0.14)"
                  : "rgba(255,255,255,0.05)",
              color: "white",
              cursor: "pointer",
            }}
          >
            All sessions
          </button>
        )}
      </div>

      {loading && <p>Loading active session...</p>}

      {sessionScope === "all" && isAdmin ? (
        <p style={{ color: "#aaa" }}>
          Admin view: showing sessions across all users.
        </p>
      ) : (
        <p>
          Viewing your sessions: <strong>{userData?.username || ownUsername}</strong>
          {userData?.email ? ` (${userData.email})` : ""}
        </p>
      )}

      {shownError && <p style={{ color: "red" }}>Error: {shownError}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Sessions</h2>

        {sessions.length === 0 ? (
          <p>No sessions found.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {sessions.map((session) => {
              const isSelected = selectedSessionId === session.id;
              const summary = session.processedSummary || {};

              return (
                <button
                  key={session.id}
                  onClick={() => {
                    const isDifferentSession = selectedSessionId !== session.id;
                    setSelectedSessionId(session.id);
                    setSelectedSession(session);
                    setSelectedTelemetry(session.latestTelemetry || null);
                    setSpeedPoints([]);
                    if (isDifferentSession) {
                      resetLapSelection();
                    }
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
                  <div>Session ID: {session.id}</div>
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
                <strong>Started:</strong>{" "}
                {formatDate(selectedSession.startedAt)}
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
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <SteeringWheel
                    steering={selectedTelemetry.steering}
                    throttle={selectedTelemetry.throttle}
                    brake={selectedTelemetry.brake}
                    label="Live Steering"
                    size={152}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 8,
                    }}
                  >
                  <p>
                    <strong>Speed:</strong> {selectedTelemetry.speedKph ?? 0}{" "}
                    km/h
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
                      : `${Number(selectedTelemetry.brakingDistance).toFixed(
                          1
                        )} m`}
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
                </div>
              ) : (
                <p>No latest telemetry for this session yet.</p>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Telemetry Map</h2>

            <LapTrailSelector
              options={lapOptions}
              selectedKey={activeTrailKey}
              onSelect={setSelectedTrailKey}
              loading={mapTrailState.historyLoading}
            />

            {activeTrackKey ? (
              <TrackTelemetryMap
                apiBase={API_BASE}
                sessionId={selectedSession.id}
                trackKey={activeTrackKey}
                mapImageUrl={mapImageUrl}
                selectedTrailKey={activeTrailKey}
                onTrailOptionsChange={setMapTrailState}
              />
            ) : (
              <p>No track key found for this session.</p>
            )}

            <div
              style={{
                marginTop: 22,
                paddingTop: 18,
                borderTop: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <h2>Lap Telemetry Chart</h2>
              <TelemetryChart
                apiBase={API_BASE}
                sessionId={selectedSession.id}
                selectedLapNumber={selectedLapNumber}
              />
            </div>
          </div>

          <div className="card">
            <h2>Live Speed Trace</h2>
            <div style={{ height: 320, marginTop: 16 }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import {
  formatSessionFlag,
  getSessionEndedAt,
  getSessionStartedAt,
  isActiveSession,
  latestSessionId,
  sortSessionsForDisplay,
} from "../utils/sessionUtils";

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
const LIVE_GRAPH_WINDOW_MS = 5000;
const LIVE_GRAPH_MAX_POINTS = 240;
const LIVE_GRAPH_METRICS = [
  { key: "speedKph", label: "Speed", color: "#38bdf8", max: 360, unit: "km/h", defaultVisible: true },
  { key: "throttlePct", label: "Throttle", color: "#22c55e", max: 100, unit: "%", defaultVisible: true },
  { key: "brakePct", label: "Brake", color: "#f87171", max: 100, unit: "%", defaultVisible: true },
  { key: "rpm", label: "RPM", color: "#facc15", max: 13000, unit: "rpm", defaultVisible: false },
  { key: "gear", label: "Gear", color: "#a78bfa", max: 8, unit: "", defaultVisible: false, stepped: true },
  { key: "drs", label: "DRS", color: "#fb7185", max: 1, unit: "", defaultVisible: false, stepped: true },
];

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

function telemetryTimestampMs(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function readTelemetryFreshness(sample) {
  if (!sample || typeof sample !== "object") {
    return {
      sampleIndex: null,
      gameTimeMs: null,
      lapNumber: null,
      lapDistance: null,
      timestampMs: null,
    };
  }

  const gameTime = Number(
    sample.gameTimeMs ??
      sample.gameTime ??
      sample.sessionTimeMs ??
      sample.sessionTime
  );

  return {
    sampleIndex: Number.isFinite(Number(sample.sampleIndex ?? sample.i))
      ? Number(sample.sampleIndex ?? sample.i)
      : null,
    gameTimeMs: Number.isFinite(gameTime) ? gameTime : null,
    lapNumber: Number.isFinite(Number(sample.lapNumber ?? sample.lap))
      ? Number(sample.lapNumber ?? sample.lap)
      : null,
    lapDistance: Number.isFinite(Number(sample.lapDistance ?? sample.d))
      ? Number(sample.lapDistance ?? sample.d)
      : null,
    timestampMs: telemetryTimestampMs(sample.timestamp ?? sample.t),
  };
}

function compareTelemetryFreshness(next, prev) {
  if (!prev) return 1;

  for (const key of ["sampleIndex", "gameTimeMs", "timestampMs"]) {
    if (next[key] !== null && prev[key] !== null) {
      const diff = next[key] - prev[key];
      if (diff !== 0) return diff;
    }
  }

  if (
    next.lapNumber !== null &&
    prev.lapNumber !== null &&
    next.lapNumber !== prev.lapNumber
  ) {
    return next.lapNumber - prev.lapNumber;
  }

  if (
    next.lapDistance !== null &&
    prev.lapDistance !== null &&
    next.lapDistance !== prev.lapDistance
  ) {
    return next.lapDistance - prev.lapDistance;
  }

  return 0;
}

function isReasonableLiveSpeed(speed, previousPoint, freshness) {
  if (!Number.isFinite(speed) || speed < 0 || speed > 430) return false;
  if (!previousPoint) return true;

  const timeDeltaMs =
    freshness.timestampMs !== null && previousPoint.timestampMs !== null
      ? freshness.timestampMs - previousPoint.timestampMs
      : null;
  const frameDelta =
    freshness.sampleIndex !== null && previousPoint.sampleIndex !== null
      ? freshness.sampleIndex - previousPoint.sampleIndex
      : null;
  const previousSpeed = Number(previousPoint.speedKph ?? previousPoint.speed);
  if (!Number.isFinite(previousSpeed)) return true;

  const speedDelta = Math.abs(speed - previousSpeed);

  if (timeDeltaMs !== null && timeDeltaMs < 0) return false;
  if (frameDelta !== null && frameDelta < 0) return false;
  if (speedDelta > 160 && (timeDeltaMs === null || timeDeltaMs < 700)) return false;
  if (speedDelta > 160 && (frameDelta === null || frameDelta < 8)) return false;

  return true;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readPercentMetric(telemetry, pctKey, rawKey) {
  const explicitPct = numberOrNull(telemetry?.[pctKey]);
  if (explicitPct !== null) {
    return explicitPct <= 1 && explicitPct >= 0 ? explicitPct * 100 : explicitPct;
  }

  const raw = numberOrNull(telemetry?.[rawKey]);
  if (raw === null) return null;
  return raw <= 1 && raw >= 0 ? raw * 100 : raw;
}

function readLiveGraphPoint(latestTelemetry, freshness) {
  const speed = numberOrNull(latestTelemetry?.speedKph);
  const point = {
    receivedAtMs: Date.now(),
    timestampMs: freshness.timestampMs,
    sampleIndex: freshness.sampleIndex,
    lapNumber: freshness.lapNumber,
    sector: latestTelemetry?.sector ?? latestTelemetry?.currentSector ?? null,
    speedKph: speed,
    throttlePct: readPercentMetric(latestTelemetry, "throttlePct", "throttle"),
    brakePct: readPercentMetric(latestTelemetry, "brakePct", "brake"),
    rpm: numberOrNull(latestTelemetry?.rpm ?? latestTelemetry?.engineRPM),
    gear: numberOrNull(latestTelemetry?.gear),
    drs: latestTelemetry?.drs === true || latestTelemetry?.drs === 1,
  };

  const hasMetric = LIVE_GRAPH_METRICS.some((metric) => {
    if (metric.key === "drs") return point.drs === true;
    return point[metric.key] !== null && point[metric.key] !== undefined;
  });

  return hasMetric ? point : null;
}

function liveGraphRawValue(metric, point) {
  if (metric.key === "drs") return point?.drs ? 1 : 0;
  const raw = point?.[metric.key];
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function liveGraphScaledValue(metric, point) {
  const value = liveGraphRawValue(metric, point);
  if (value === null) return null;
  if (metric.key === "drs") return value ? 100 : 0;
  return Math.max(0, Math.min(100, (value / metric.max) * 100));
}

function liveGraphValueLabel(metric, raw) {
  if (raw === null || raw === undefined) return "-";
  if (metric.key === "drs") return raw ? "On" : "Off";

  const value = Number(raw);
  if (!Number.isFinite(value)) return "-";
  if (metric.key === "rpm" || metric.key === "gear") {
    return Math.round(value).toString() + (metric.unit ? " " + metric.unit : "");
  }

  return value.toFixed(1) + (metric.unit ? " " + metric.unit : "");
}

function LiveTelemetryGraph({ points }) {
  const [visibleMetrics, setVisibleMetrics] = useState(() =>
    LIVE_GRAPH_METRICS.reduce((next, metric) => {
      next[metric.key] = metric.defaultVisible;
      return next;
    }, {})
  );

  const labels = useMemo(() => {
    if (points.length === 0) return [];
    const firstTime = points[0].receivedAtMs || Date.now();
    return points.map((point) => {
      const elapsedSeconds = Math.max(0, (point.receivedAtMs - firstTime) / 1000);
      return elapsedSeconds.toFixed(1) + "s";
    });
  }, [points]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: LIVE_GRAPH_METRICS.filter((metric) => visibleMetrics[metric.key]).map((metric) => ({
        label: metric.label,
        data: points.map((point) => liveGraphScaledValue(metric, point)),
        borderColor: metric.color,
        backgroundColor: metric.color,
        borderWidth: metric.key === "speedKph" ? 2.5 : 2,
        pointRadius: 0,
        tension: metric.stepped ? 0 : 0.22,
        stepped: metric.stepped || false,
        spanGaps: true,
        metricKey: metric.key,
      })),
    }),
    [labels, points, visibleMetrics]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      animation: false,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        x: {
          ticks: {
            color: "#94a3b8",
            maxTicksLimit: 6,
          },
          grid: {
            color: "rgba(255,255,255,0.06)",
          },
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: "#cbd5e1",
            callback: (value) => value + "%",
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#cbd5e1",
            usePointStyle: true,
            boxWidth: 8,
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const metric = LIVE_GRAPH_METRICS.find(
                (item) => item.key === context.dataset.metricKey
              );
              const point = points[context.dataIndex] || {};
              if (!metric) return context.dataset.label + ": -";
              return (
                metric.label +
                ": " +
                liveGraphValueLabel(metric, liveGraphRawValue(metric, point))
              );
            },
            afterBody(items) {
              const point = points[items[0]?.dataIndex] || {};
              return [
                "Lap: " + (point.lapNumber ?? "-"),
                "Sector: " + (point.sector ?? "-"),
                "Sample: " + (point.sampleIndex ?? "-"),
              ];
            },
          },
        },
      },
    }),
    [points]
  );

  return (
    <div className="card analysis-section-card live-telemetry-graph-card">
      <div className="analysis-panel-head">
        <div>
          <h2>Live Telemetry Overlay</h2>
          <p className="analysis-muted">
            Rolling view of the newest {Math.round(LIVE_GRAPH_WINDOW_MS / 1000)} seconds.
          </p>
        </div>

        <div className="live-telemetry-toggle-row">
          {LIVE_GRAPH_METRICS.map((metric) => (
            <label
              key={metric.key}
              className={
                visibleMetrics[metric.key]
                  ? "live-telemetry-toggle active"
                  : "live-telemetry-toggle"
              }
              style={{
                "--metric-color": metric.color,
              }}
            >
              <input
                type="checkbox"
                checked={visibleMetrics[metric.key] === true}
                onChange={() =>
                  setVisibleMetrics((current) => ({
                    ...current,
                    [metric.key]: current[metric.key] !== true,
                  }))
                }
              />
              <span className="live-telemetry-toggle-dot" />
              {metric.label}
            </label>
          ))}
        </div>
      </div>

      {points.length < 2 ? (
        <p className="analysis-muted">
          Waiting for live telemetry samples. The graph appears once the listener sends a few updates.
        </p>
      ) : (
        <div className="live-telemetry-graph-wrap">
          <Line data={chartData} options={chartOptions} />
        </div>
      )}
    </div>
  );
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedSessionId = searchParams.get("session");
  const isAdmin =
    currentUser?.isAdmin === true || currentUser?.role === "admin";
  const ownUsername = currentUser?.username || "";
  const [sessionScope, setSessionScope] = useState("mine");
  const activeUsername =
    isAdmin && sessionScope === "all" ? "" : ownUsername;
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedTelemetry, setSelectedTelemetry] = useState(null);
  const [liveGraphPoints, setLiveGraphPoints] = useState([]);
  const [selectedTrailKey, setSelectedTrailKey] = useState("current");
  const [mapTrailState, setMapTrailState] = useState(() =>
    createEmptyMapTrailState()
  );
  const [localError, setLocalError] = useState("");
  const lastTelemetryFreshnessRef = useRef(null);
  const lastLiveGraphPointRef = useRef(null);

  const {
    sessionId: autoSessionId,
    sessionData: autoSessionData,
    sessions,
    userData,
    loading,
    error,
  } = useActiveSession(activeUsername);

  const displaySessions = useMemo(() => sortSessionsForDisplay(sessions), [sessions]);
  const latestId = useMemo(() => latestSessionId(sessions), [sessions]);

  function resetLiveGraphTrace() {
    lastTelemetryFreshnessRef.current = null;
    lastLiveGraphPointRef.current = null;
    setLiveGraphPoints([]);
  }

  function appendLiveGraphPoint(latestTelemetry, freshness) {
    const speed = Number(latestTelemetry?.speedKph);

    if (
      Number.isFinite(speed) &&
      !isReasonableLiveSpeed(speed, lastLiveGraphPointRef.current, freshness)
    ) {
      return;
    }

    const point = readLiveGraphPoint(latestTelemetry, freshness);
    if (!point) return;

    lastLiveGraphPointRef.current = point;
    setLiveGraphPoints((prev) => {
      const cutoff = point.receivedAtMs - LIVE_GRAPH_WINDOW_MS;
      return [...prev, point]
        .filter((item) => item.receivedAtMs >= cutoff)
        .slice(-LIVE_GRAPH_MAX_POINTS);
    });
  }

  useEffect(() => {
    if (!autoSessionId) {
      setSelectedSessionId(null);
      setSelectedSession(null);
      setSelectedTelemetry(null);
      resetLiveGraphTrace();
      setSelectedTrailKey("current");
      setMapTrailState(createEmptyMapTrailState());
      return;
    }

    setSelectedSessionId((prev) => {
      if (
        requestedSessionId &&
        sessions.some((session) => session.id === requestedSessionId)
      ) {
        return requestedSessionId;
      }

      if (prev && sessions.some((session) => session.id === prev)) {
        return prev;
      }

      return autoSessionId;
    });
  }, [autoSessionId, requestedSessionId, sessions]);

  useEffect(() => {
    resetLiveGraphTrace();
    setSelectedTrailKey("current");
    setMapTrailState(createEmptyMapTrailState());
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) return undefined;

    const trimTimer = window.setInterval(() => {
      const cutoff = Date.now() - LIVE_GRAPH_WINDOW_MS;
      setLiveGraphPoints((prev) => prev.filter((point) => point.receivedAtMs >= cutoff));
    }, 500);

    return () => window.clearInterval(trimTimer);
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

        const latestTelemetry = data.latestTelemetry || null;

        if (!latestTelemetry) {
          setSelectedSession(data);
          setSelectedTelemetry(null);
          return;
        }

        const freshness = readTelemetryFreshness(latestTelemetry);
        const freshnessDelta = compareTelemetryFreshness(
          freshness,
          lastTelemetryFreshnessRef.current
        );

        if (freshnessDelta < 0) {
          return;
        }

        setSelectedSession(data);
        setSelectedTelemetry(latestTelemetry);

        if (freshnessDelta > 0) {
          lastTelemetryFreshnessRef.current = freshness;
          appendLiveGraphPoint(latestTelemetry, freshness);
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
    resetLiveGraphTrace();
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

        {displaySessions.length === 0 ? (
          <p>No sessions found.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {displaySessions.map((session) => {
              const isSelected = selectedSessionId === session.id;
              const summary = session.processedSummary || {};
              const active = isActiveSession(session);
              const latest = session.id === latestId;

              return (
                <button
                  key={session.id}
                  onClick={() => {
                    navigate(`/session/${encodeURIComponent(session.id)}`);
                  }}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    border: isSelected
                      ? "2px solid var(--color-accent-blue)"
                      : active
                        ? "1px solid rgba(34,197,94,0.75)"
                        : "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    background: active
                      ? "linear-gradient(90deg, rgba(34,197,94,0.16), rgba(255,255,255,0.04))"
                      : isSelected
                        ? "rgba(59,130,246,0.16)"
                        : "rgba(255,255,255,0.04)",
                    boxShadow: latest
                      ? "inset 3px 0 0 var(--color-accent-yellow)"
                      : "none",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{session.trackName || "Unknown Track"}</strong>
                    <span
                      style={{
                        padding: "2px 7px",
                        borderRadius: 999,
                        border: active
                          ? "1px solid rgba(34,197,94,0.65)"
                          : "1px solid rgba(255,255,255,0.16)",
                        background: active
                          ? "rgba(34,197,94,0.12)"
                          : "rgba(255,255,255,0.04)",
                        color: active ? "#bbf7d0" : "#cbd5e1",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {active ? "Active" : "Ended"}
                    </span>
                    {latest && (
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 999,
                          border: "1px solid rgba(250,204,21,0.65)",
                          background: "rgba(250,204,21,0.12)",
                          color: "#fef3c7",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        Latest
                      </span>
                    )}
                  </div>
                  <div>Session ID: {session.id}</div>
                  <div>Track Key: {getTrackKey(session) || "-"}</div>
                  <div>Session Type: {session.sessionType ?? "-"}</div>
                  <div>Custom Setup: {formatSessionFlag(session.customSetup)}</div>
                  <div>Equal Performance: {formatSessionFlag(session.equalPerformance)}</div>
                  <div>Started: {formatDate(getSessionStartedAt(session))}</div>
                  <div>Ended: {formatDate(getSessionEndedAt(session))}</div>
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
                <strong>Custom Setup:</strong> {formatSessionFlag(selectedSession.customSetup)}
              </p>
              <p>
                <strong>Equal Performance:</strong> {formatSessionFlag(selectedSession.equalPerformance)}
              </p>
              <p>
                <strong>Started:</strong>{" "}
                {formatDate(getSessionStartedAt(selectedSession))}
              </p>
              <p>
                <strong>Ended:</strong> {formatDate(getSessionEndedAt(selectedSession))}
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

          <LiveTelemetryGraph points={liveGraphPoints} />
        </>
      )}
    </div>
  );
}

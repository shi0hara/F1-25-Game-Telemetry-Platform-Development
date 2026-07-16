import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, onSnapshot } from "firebase/firestore";
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
import AssistIcons from "../components/AssistIcons";
import {
  formatSessionFlag,
  getSessionEndedAt,
  getSessionStartedAt,
  getTrackKeyFromSession,
  isActiveSession,
  toMillis,
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

const GRAPH_METRICS = [
  { key: "speedKph", label: "Speed", color: "#38bdf8", max: 360, unit: "km/h", defaultVisible: true },
  { key: "throttlePct", label: "Throttle", color: "#22c55e", max: 100, unit: "%", defaultVisible: true },
  { key: "brakePct", label: "Brake", color: "#f87171", max: 100, unit: "%", defaultVisible: true },
  { key: "rpm", label: "RPM", color: "#facc15", max: 13000, unit: "rpm", defaultVisible: false },
  { key: "gear", label: "Gear", color: "#a78bfa", max: 8, unit: "", defaultVisible: false, stepped: true },
  { key: "drs", label: "DRS", color: "#fb7185", max: 1, unit: "", defaultVisible: false, stepped: true },
];

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");
  return token ? { Authorization: "Bearer " + token } : {};
}

function formatDateTime(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function formatLapTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const fraction = Math.trunc(value % 1000);
  return (
    minutes +
    ":" +
    seconds.toString().padStart(2, "0") +
    "." +
    fraction.toString().padStart(3, "0")
  );
}

function formatDelta(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) < 0.5) return "Best";
  return "+" + (value / 1000).toFixed(3) + "s";
}

function formatNumber(value, digits = 1, suffix = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits) + suffix;
}

function normalizeLapDoc(lapDoc, bestLapTimeMs = null) {
  const lapTimeMs = Number(lapDoc.lapTimeMs);
  const normalizedLapTime = Number.isFinite(lapTimeMs) && lapTimeMs > 0 ? lapTimeMs : null;

  return {
    id: lapDoc.id,
    lapNumber: lapDoc.lapNumber ?? null,
    lapTimeMs: normalizedLapTime,
    sector1Ms: Number.isFinite(Number(lapDoc.sector1Ms)) ? Number(lapDoc.sector1Ms) : null,
    sector2Ms: Number.isFinite(Number(lapDoc.sector2Ms)) ? Number(lapDoc.sector2Ms) : null,
    sector3Ms: Number.isFinite(Number(lapDoc.sector3Ms)) ? Number(lapDoc.sector3Ms) : null,
    valid: lapDoc.valid === true,
    assists: lapDoc.assists || null,
    recordedAt: lapDoc.recordedAt || null,
    gapToBestMs:
      bestLapTimeMs != null && normalizedLapTime != null
        ? normalizedLapTime - bestLapTimeMs
        : null,
  };
}

async function loadPostSessionFallback(sessionId, session) {
  const [lapsSnap, reportSnap] = await Promise.all([
    getDocs(collection(db, "sessions", sessionId, "laps")),
    getDoc(doc(db, "sessions", sessionId, "reports", "postSession")).catch(() => null),
  ]);

  const rawLaps = lapsSnap.docs
    .map((lapDoc) => ({ id: lapDoc.id, ...lapDoc.data() }))
    .sort((a, b) => Number(a.lapNumber || 0) - Number(b.lapNumber || 0));
  const validLapTimes = rawLaps
    .filter((lap) => lap.valid === true)
    .map((lap) => Number(lap.lapTimeMs))
    .filter((value) => Number.isFinite(value) && value > 0);
  const bestLapTimeMs = validLapTimes.length ? Math.min(...validLapTimes) : null;
  const laps = rawLaps.map((lap) => normalizeLapDoc(lap, bestLapTimeMs));
  const bestLap = laps.find((lap) => lap.valid && lap.lapTimeMs === bestLapTimeMs) || null;
  const report = reportSnap?.exists()
    ? { id: reportSnap.id, ...reportSnap.data() }
    : null;

  return {
    session,
    stats: {
      sampleCount: 0,
      rawSampleCount: 0,
      lapCount: laps.length,
      validLapCount: laps.filter((lap) => lap.valid).length,
      bestLap,
      topSpeedKph: session?.processedSummary?.topSpeedKph ?? null,
      averageSpeedKph: null,
      averageThrottlePct: null,
      averageBrakePct: null,
      drs: null,
    },
    laps,
    traces: [],
    report,
    meta: {
      analysisType: "post_session_firestore_fallback",
    },
  };
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

function StatBox({ label, value, subvalue, color }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 13 }}>{label}</div>
      <div style={{ color: color || "white", fontSize: 22, fontWeight: 800 }}>
        {value}
      </div>
      {subvalue && <div style={{ color: "#94a3b8", fontSize: 12 }}>{subvalue}</div>}
    </div>
  );
}

function graphRawValue(metric, sample) {
  if (metric.key === "drs") return sample.drs ? 1 : 0;
  const raw = sample[metric.key];
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function graphScaledValue(metric, sample) {
  const value = graphRawValue(metric, sample);
  if (value === null) return null;
  if (metric.key === "drs") return value ? 100 : 0;
  return Math.max(0, Math.min(100, (value / metric.max) * 100));
}

function buildRaceBoundaries(traces) {
  const boundaries = [];
  let previousLap = null;

  traces.forEach((sample, index) => {
    const lapNumber = Number(sample.lapNumber);
    if (!Number.isFinite(lapNumber)) return;

    if (previousLap === null) {
      previousLap = lapNumber;
      return;
    }

    if (lapNumber !== previousLap) {
      boundaries.push({
        index,
        label: "Lap " + lapNumber,
      });
    }

    previousLap = lapNumber;
  });

  return boundaries.slice(0, 40);
}

function hasUsefulSpan(values, minSpan = 5) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return false;
  return Math.max(...clean) - Math.min(...clean) >= minSpan;
}

function buildSessionGraphLabels(traces) {
  const distanceValues = traces.map((sample) => sample.distanceM);
  if (hasUsefulSpan(distanceValues)) {
    return traces.map((sample, index) => {
      const distance = Number(sample.distanceM);
      return Number.isFinite(distance) ? Math.round(distance) + "m" : String(index + 1);
    });
  }

  const lapDistanceValues = traces.map((sample) => sample.lapDistance);
  if (hasUsefulSpan(lapDistanceValues)) {
    return traces.map((sample, index) => {
      const lapNumber = sample.lapNumber ?? "-";
      const lapDistance = Number(sample.lapDistance);
      return Number.isFinite(lapDistance)
        ? `L${lapNumber} ${Math.round(lapDistance)}m`
        : String(index + 1);
    });
  }

  return traces.map((_, index) => "Sample " + (index + 1));
}

function canOrderByLapDistance(traces) {
  const usable = traces.filter((sample) => {
    return (
      Number.isFinite(Number(sample.lapNumber)) &&
      Number.isFinite(Number(sample.lapDistance))
    );
  });

  return usable.length >= Math.max(3, traces.length * 0.65);
}

function orderSessionTraces(traces) {
  if (!canOrderByLapDistance(traces)) return traces;

  return [...traces].sort((a, b) => {
    const aLap = Number(a.lapNumber);
    const bLap = Number(b.lapNumber);
    if (aLap !== bLap) return aLap - bLap;

    const aDistance = Number(a.lapDistance);
    const bDistance = Number(b.lapDistance);
    if (aDistance !== bDistance) return aDistance - bDistance;

    const aIndex = Number(a.sampleIndex ?? a.index);
    const bIndex = Number(b.sampleIndex ?? b.index);
    if (Number.isFinite(aIndex) && Number.isFinite(bIndex) && aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    return 0;
  });
}

const raceGraphGuidesPlugin = {
  id: "raceGraphGuides",
  afterDatasetsDraw(chart, _args, options) {
    const xScale = chart.scales.x;
    const chartArea = chart.chartArea;
    if (!xScale || !chartArea) return;

    const ctx = chart.ctx;
    for (const boundary of options.boundaries || []) {
      const x = xScale.getPixelForValue(boundary.index);
      if (!Number.isFinite(x)) continue;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(168,85,247,0.72)";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#c4b5fd";
      ctx.font = "700 11px Arial";
      ctx.fillText(boundary.label, x + 5, chartArea.top + 14);
      ctx.restore();
    }
  },
};

function RaceTelemetryGraph({ traces }) {
  const [visibleMetrics, setVisibleMetrics] = useState(() => {
    return GRAPH_METRICS.reduce((next, metric) => {
      next[metric.key] = metric.defaultVisible;
      return next;
    }, {});
  });

  const orderedTraces = useMemo(() => orderSessionTraces(traces), [traces]);

  const labels = useMemo(() => {
    return buildSessionGraphLabels(orderedTraces);
  }, [orderedTraces]);

  const boundaries = useMemo(() => buildRaceBoundaries(orderedTraces), [orderedTraces]);

  const chartData = useMemo(() => {
    return {
      labels,
      datasets: GRAPH_METRICS.filter((metric) => visibleMetrics[metric.key]).map((metric) => ({
        label: metric.label,
        data: orderedTraces.map((sample) => graphScaledValue(metric, sample)),
        borderColor: metric.color,
        backgroundColor: metric.color,
        borderWidth: metric.key === "speedKph" ? 2.5 : 2,
        pointRadius: 0,
        tension: metric.stepped ? 0 : 0.22,
        stepped: metric.stepped || false,
        spanGaps: true,
        rawMetric: metric,
      })),
    };
  }, [labels, orderedTraces, visibleMetrics]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        x: {
          ticks: {
            color: "#94a3b8",
            maxTicksLimit: 8,
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
              const metric = context.dataset.rawMetric;
              const sample = orderedTraces[context.dataIndex] || {};
              const raw = metric ? graphRawValue(metric, sample) : null;
              if (raw === null) return context.dataset.label + ": -";
              if (metric.key === "drs") return context.dataset.label + ": " + (raw ? "On" : "Off");
              return context.dataset.label + ": " + formatNumber(raw, metric.key === "rpm" ? 0 : 1, metric.unit ? " " + metric.unit : "");
            },
            afterBody(items) {
              const sample = orderedTraces[items[0]?.dataIndex] || {};
              return [
                "Lap: " + (sample.lapNumber ?? "-"),
                "Sector: " + (sample.sector ?? "-"),
              ];
            },
          },
        },
        raceGraphGuides: {
          boundaries,
        },
      },
    };
  }, [boundaries, orderedTraces]);

  if (!traces.length) {
    return (
      <div className="card">
        <h2>Telemetry Overlay</h2>
        <p style={{ color: "#94a3b8" }}>
          No saved telemetry samples were found for the session graph yet.
        </p>
      </div>
    );
  }

  const chartMinWidth = Math.max(1800, orderedTraces.length * 12);

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Telemetry Overlay</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {GRAPH_METRICS.map((metric) => (
            <label
              key={metric.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 9px",
                borderRadius: 8,
                border: visibleMetrics[metric.key]
                  ? "1px solid " + metric.color
                  : "1px solid rgba(255,255,255,0.14)",
                background: visibleMetrics[metric.key]
                  ? "rgba(255,255,255,0.07)"
                  : "rgba(255,255,255,0.03)",
                color: "white",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={visibleMetrics[metric.key] === true}
                onChange={() => {
                  setVisibleMetrics((current) => ({
                    ...current,
                    [metric.key]: current[metric.key] !== true,
                  }));
                }}
              />
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 9,
                  background: metric.color,
                  display: "inline-block",
                }}
              />
              {metric.label}
            </label>
          ))}
        </div>
      </div>

      <div
        style={{
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        <div style={{ minWidth: chartMinWidth, height: 430 }}>
          <Line data={chartData} options={options} plugins={[raceGraphGuidesPlugin]} />
        </div>
      </div>
    </div>
  );
}

function LiveSessionPanel({ session }) {
  const trackKey = getTrackKeyFromSession(session);
  const telemetry = session?.latestTelemetry || {};

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Live Session</h2>
            <p style={{ color: "#94a3b8", margin: "4px 0 0" }}>
              This session is still active, so this page follows the current telemetry.
            </p>
          </div>
          <Link
            to={`/live?session=${encodeURIComponent(session.id)}`}
            style={{
              color: "white",
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "8px 12px",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            Open Full Live View
          </Link>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h2>Current Telemetry</h2>
          {session.latestTelemetry ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 12,
                alignItems: "center",
              }}
            >
              <SteeringWheel
                steering={telemetry.steering}
                throttle={telemetry.throttle}
                brake={telemetry.brake}
                label="Live Steering"
                size={152}
              />
              <div style={{ display: "grid", gap: 8 }}>
                <p><strong>Speed:</strong> {telemetry.speedKph ?? 0} km/h</p>
                <p><strong>Gear:</strong> {telemetry.gear ?? "-"}</p>
                <p><strong>RPM:</strong> {telemetry.rpm ?? telemetry.engineRPM ?? "-"}</p>
                <p><strong>Lap:</strong> {telemetry.lapNumber ?? "-"}</p>
                <p><strong>DRS:</strong> {telemetry.drs ? "On" : "Off"}</p>
              </div>
            </div>
          ) : (
            <p style={{ color: "#94a3b8" }}>Waiting for live telemetry samples.</p>
          )}
        </div>

        <div className="card">
          <h2>Session Info</h2>
          <p><strong>Driver:</strong> {session.username || "-"}</p>
          <p><strong>Track:</strong> {session.trackName || "-"}</p>
          <p><strong>Custom Setup:</strong> {formatSessionFlag(session.customSetup)}</p>
          <p><strong>Equal Performance:</strong> {formatSessionFlag(session.equalPerformance)}</p>
          <p><strong>Started:</strong> {formatDateTime(getSessionStartedAt(session))}</p>
          <p><strong>Ended:</strong> {formatDateTime(getSessionEndedAt(session))}</p>
          <p><strong>Latest update:</strong> {formatDateTime(session.latestTelemetryAt || session.updatedAt)}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Live Map</h2>
        {trackKey ? (
          <TrackTelemetryMap
            apiBase={API_BASE}
            sessionId={session.id}
            trackKey={trackKey}
            mapImageUrl={getDefaultMapImage(trackKey)}
          />
        ) : (
          <p style={{ color: "#94a3b8" }}>No track key found for this session.</p>
        )}
      </div>

      <div className="card">
        <h2>Lap Timing</h2>
        <TelemetryChart apiBase={API_BASE} sessionId={session.id} />
      </div>
    </>
  );
}

function PostSessionPanel({ details }) {
  const navigate = useNavigate();
  const { session, stats, laps, traces, report } = details;
  const signals = report?.topCoachSignals || [];
  const findings = report?.precisionFindings || [];

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatBox
          label="Best Lap"
          value={formatLapTime(stats.bestLap?.lapTimeMs)}
          subvalue={stats.bestLap ? "Lap " + (stats.bestLap.lapNumber ?? "-") : "No valid lap"}
          color="#22c55e"
        />
        <StatBox
          label="Theoretical Best"
          value={report?.theoreticalBestLap?.lapTime || "-"}
          subvalue="Best valid sectors combined"
          color="#a855f7"
        />
        <StatBox
          label="Valid Laps"
          value={`${stats.validLapCount ?? 0}/${stats.lapCount ?? 0}`}
          color="#38bdf8"
        />
        <StatBox
          label="Top Speed"
          value={formatNumber(stats.topSpeedKph, 1, " km/h")}
          color="#facc15"
        />
        <StatBox
          label="Average Speed"
          value={formatNumber(stats.averageSpeedKph, 1, " km/h")}
        />
        <StatBox
          label="DRS Reaction"
          value={
            stats.drs?.avgActivationDelayMs != null
              ? formatNumber(stats.drs.avgActivationDelayMs / 1000, 2, " s")
              : "-"
          }
          subvalue={
            stats.drs?.activationCount
              ? stats.drs.activationCount + " activations"
              : "Needs DRS-ready telemetry"
          }
        />
      </div>

      {(signals.length > 0 || findings.length > 0) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>AI Coaching Evidence</h2>
          {signals.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {signals.slice(0, 4).map((signal, index) => (
                <div
                  key={`${signal.type || "signal"}-${index}`}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <strong>{signal.title || signal.type || "Coaching signal"}</strong>
                  <div style={{ color: "#94a3b8", marginTop: 4 }}>
                    {signal.interpretation || signal.detail || signal.summary || "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {signals.length === 0 && findings.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {findings.slice(0, 4).map((finding, index) => (
                <div
                  key={`${finding.type || "finding"}-${index}`}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <strong>{finding.title || finding.type || "Finding"}</strong>
                  <div style={{ color: "#94a3b8", marginTop: 4 }}>
                    {finding.interpretation || finding.detail || finding.summary || "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Lap Breakdown</h2>
        {laps.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No laps were saved for this session.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="f1-table">
              <thead>
                <tr>
                  <th>Lap</th>
                  <th>Lap Time</th>
                  <th>Gap</th>
                  <th>S1</th>
                  <th>S2</th>
                  <th>S3</th>
                  <th>Valid</th>
                  <th>Assists</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {laps.map((lap) => {
                  const path = `/analysis/${encodeURIComponent(session.id)}/lap/${encodeURIComponent(lap.id)}?from=session`;
                  return (
                    <tr
                      key={lap.id || lap.lapNumber}
                      className="clickable-row"
                      role="button"
                      tabIndex={0}
                      title="Open lap performance analysis"
                      onClick={() => navigate(path)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(path);
                        }
                      }}
                    >
                      <td><strong>Lap {lap.lapNumber ?? "-"}</strong></td>
                      <td className="lap-time">{formatLapTime(lap.lapTimeMs)}</td>
                      <td>{formatDelta(lap.gapToBestMs)}</td>
                      <td>{formatLapTime(lap.sector1Ms)}</td>
                      <td>{formatLapTime(lap.sector2Ms)}</td>
                      <td>{formatLapTime(lap.sector3Ms)}</td>
                      <td style={{ color: lap.valid ? "#22c55e" : "#f87171" }}>
                        {lap.valid ? "Yes" : "No"}
                      </td>
                      <td><AssistIcons assists={lap.assists} /></td>
                      <td>{formatDateTime(lap.recordedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RaceTelemetryGraph traces={traces || []} />
    </>
  );
}

export default function SessionDetails() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!sessionId) return undefined;

    setSessionLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      doc(db, "sessions", sessionId),
      (snapshot) => {
        setSessionLoading(false);
        if (!snapshot.exists()) {
          setSession(null);
          setError("Session not found.");
          return;
        }
        setSession({
          id: snapshot.id,
          ...snapshot.data(),
        });
      },
      (err) => {
        console.error("Session listener error:", err);
        setSessionLoading(false);
        setError(err.message || "Failed to load session.");
      }
    );

    return unsubscribe;
  }, [sessionId]);

  const active = isActiveSession(session);

  useEffect(() => {
    if (!sessionId || !session || active) {
      setDetails(null);
      return undefined;
    }

    let cancelled = false;

    async function loadDetails() {
      try {
        setDetailsLoading(true);
        setError("");
        setNotice("");

        const res = await fetch(
          `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/performance?maxSamples=1100`,
          { headers: getAuthHeaders() }
        );
        const contentType = res.headers.get("content-type") || "";
        const body = contentType.includes("application/json")
          ? await res.json().catch(() => null)
          : null;

        if (!res.ok) {
          throw new Error(
            body?.error ||
              `Backend session-performance endpoint unavailable: HTTP ${res.status}`
          );
        }

        if (!cancelled) {
          setDetails(body);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Session details load error:", err);
          try {
            const fallback = await loadPostSessionFallback(sessionId, session);
            if (!cancelled) {
              setDetails(fallback);
              setNotice(
                "Showing Firestore fallback details. Redeploy the backend to enable the full session telemetry graph."
              );
              setError("");
            }
          } catch (fallbackErr) {
            console.error("Session details fallback error:", fallbackErr);
            if (!cancelled) {
              setError(
                `${err.message || "Failed to load post-session details."} Fallback also failed: ${
                  fallbackErr.message || "unknown error"
                }`
              );
            }
          }
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    }

    loadDetails();

    return () => {
      cancelled = true;
    };
  }, [active, session, sessionId]);

  const shownSession = details?.session || session || {};

  return (
    <div className="page-container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h1>
            Session <span className={active ? "text-green" : "text-blue"}>{active ? "Live" : "Review"}</span>
          </h1>
          <p style={{ color: "#94a3b8", marginTop: 4 }}>
            {shownSession.trackName || "Unknown Track"} | {shownSession.username || "Unknown Driver"} | Started {formatDateTime(getSessionStartedAt(shownSession))}
          </p>
        </div>

        <Link
          to="/profile"
          style={{
            color: "white",
            textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          Back to Profile
        </Link>
      </div>

      {sessionLoading && <p>Loading session...</p>}
      {notice && <p style={{ color: "#facc15" }}>{notice}</p>}
      {error && <p style={{ color: "#f87171" }}>Error: {error}</p>}

      {!sessionLoading && session && active && <LiveSessionPanel session={session} />}

      {!sessionLoading && session && !active && detailsLoading && (
        <p>Loading post-session details...</p>
      )}

      {!sessionLoading && session && !active && !detailsLoading && details && (
        <PostSessionPanel details={details} />
      )}
    </div>
  );
}

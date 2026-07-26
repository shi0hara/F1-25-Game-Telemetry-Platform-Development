import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import LiveSessionTelemetryPanel from "../components/LiveSessionTelemetryPanel";
import AssistIcons from "../components/AssistIcons";
import AiCoachDrawer from "../components/AiCoachDrawer";
import { trimFutureLapPointsOnReset } from "../utils/lapResetTrim";
import {
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
  const lapNumber = parseSessionLapNumber(lapDoc.lapNumber ?? lapDoc.label ?? lapDoc.id);

  return {
    id: lapDoc.id,
    lapNumber,
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

function parseSessionLapNumber(value) {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const text = String(value);
  const lapMatch = text.match(/lap\D*(\d+)/i);
  if (lapMatch) return Number(lapMatch[1]);

  const firstNumber = text.match(/\d+/);
  return firstNumber ? Number(firstNumber[0]) : null;
}

function lapCompletenessScore(lap) {
  let score = 0;
  if (Number(lap?.lapTimeMs) > 0) score += 4;
  if (Number(lap?.sector1Ms) > 0) score += 1;
  if (Number(lap?.sector2Ms) > 0) score += 1;
  if (Number(lap?.sector3Ms) > 0) score += 1;
  if (lap?.valid === true) score += 2;
  return score;
}

function normalizeSessionLaps(rows) {
  const byLap = new Map();

  for (const row of rows || []) {
    const lapNumber = parseSessionLapNumber(row?.lapNumber ?? row?.label ?? row?.id);
    if (lapNumber == null) continue;

    const normalizedRow = {
      ...row,
      lapNumber,
    };
    const key = String(lapNumber);
    const existing = byLap.get(key);

    if (
      !existing ||
      lapCompletenessScore(normalizedRow) > lapCompletenessScore(existing) ||
      (
        lapCompletenessScore(normalizedRow) === lapCompletenessScore(existing) &&
        Number(normalizedRow.lapTimeMs || Infinity) < Number(existing.lapTimeMs || Infinity)
      )
    ) {
      byLap.set(key, normalizedRow);
    }
  }

  return [...byLap.values()].sort(
    (a, b) => Number(a.lapNumber || 0) - Number(b.lapNumber || 0)
  );
}

async function loadPostSessionFallback(sessionId, session) {
  const [lapsSnap, reportSnap] = await Promise.all([
    getDocs(collection(db, "sessions", sessionId, "laps")),
    getDoc(doc(db, "sessions", sessionId, "reports", "postSession")).catch(() => null),
  ]);

  const rawLaps = normalizeSessionLaps(
    lapsSnap.docs.map((lapDoc) => ({ id: lapDoc.id, ...lapDoc.data() }))
  );
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
    track_0: "/maps/albert-park.avif",
    track_7: "/maps/great-britain.avif",
    track_12: "/maps/singapore.avif",
    track_11: "/maps/monza.png",
    track_13: "/maps/suzuka.png",
  };

  return mapImages[trackKey] || "/maps/default-track.png";
}

function StatBox({ label, value, subvalue, color }) {
  return (
    <div className="analysis-stat-card">
      <div className="analysis-stat-label">{label}</div>
      <div className="analysis-stat-value" style={{ color: color || "white" }}>
        {value}
      </div>
      {subvalue && <div className="analysis-stat-subvalue">{subvalue}</div>}
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
  const seenLaps = new Set();

  traces.forEach((sample, index) => {
    const lapNumber = Number(sample.graphLapNumber ?? sample.lapNumber);
    if (!Number.isFinite(lapNumber)) return;

    if (previousLap === null) {
      previousLap = lapNumber;
      seenLaps.add(lapNumber);
      return;
    }

    if (lapNumber !== previousLap && !seenLaps.has(lapNumber)) {
      boundaries.push({
        index,
        label: "Lap " + lapNumber,
      });
      seenLaps.add(lapNumber);
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
  if (traces.some((sample) => sample.graphLapNumber != null)) {
    return traces.map((sample, index) => {
      const lapNumber = sample.graphLapNumber ?? sample.lapNumber ?? "-";
      const lapDistance = Number(sample.lapDistance);
      return Number.isFinite(lapDistance)
        ? `L${lapNumber} ${Math.round(lapDistance)}m`
        : String(index + 1);
    });
  }

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
      const lapNumber = sample.graphLapNumber ?? sample.lapNumber ?? "-";
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

function compareGraphSamples(a, b) {
  const aDistance = Number(a.lapDistance);
  const bDistance = Number(b.lapDistance);
  if (Number.isFinite(aDistance) && Number.isFinite(bDistance) && aDistance !== bDistance) {
    return aDistance - bDistance;
  }

  const aIndex = Number(a.sampleIndex ?? a.index);
  const bIndex = Number(b.sampleIndex ?? b.index);
  if (Number.isFinite(aIndex) && Number.isFinite(bIndex) && aIndex !== bIndex) {
    return aIndex - bIndex;
  }

  return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
}

function dedupeGraphLapSamples(samples) {
  const next = [];

  for (const sample of samples) {
    const distance = Number(sample.lapDistance);
    const previous = next[next.length - 1];
    const previousDistance = Number(previous?.lapDistance);

    if (
      previous &&
      Number.isFinite(distance) &&
      Number.isFinite(previousDistance) &&
      Math.abs(distance - previousDistance) < 0.75
    ) {
      next[next.length - 1] = {
        ...previous,
        ...sample,
      };
      continue;
    }

    next.push(sample);
  }

  return next;
}

function normalizeSessionTracesForGraph(traces) {
  if (!canOrderByLapDistance(traces)) return traces;

  const byLap = new Map();

  traces.forEach((sample, index) => {
    const lapNumber = Number(sample.lapNumber);
    if (!Number.isFinite(lapNumber)) return;

    if (!byLap.has(lapNumber)) {
      byLap.set(lapNumber, []);
    }

    byLap.get(lapNumber).push({
      ...sample,
      graphSourceIndex: index,
    });
  });

  const normalized = [];
  const lapNumbers = [...byLap.keys()].sort((a, b) => a - b);

  for (const lapNumber of lapNumbers) {
    const resetTrimmedSamples = trimFutureLapPointsOnReset(byLap.get(lapNumber) || []);
    const samples = dedupeGraphLapSamples(
      [...resetTrimmedSamples].sort(compareGraphSamples)
    );

    for (const sample of samples) {
      const lapDistance = Number(sample.lapDistance);

      normalized.push({
        ...sample,
        graphLapNumber: lapNumber,
        graphDistanceM: Number.isFinite(lapDistance)
          ? (lapNumber - lapNumbers[0]) * 10000 + lapDistance
          : normalized.length,
      });
    }
  }

  return normalized.length >= 2 ? normalized : traces;
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

  const orderedTraces = useMemo(() => normalizeSessionTracesForGraph(traces), [traces]);

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
      <div className="card analysis-section-card">
        <h2>Telemetry Overlay</h2>
        <p className="analysis-muted">
          No saved telemetry samples were found for the session graph yet.
        </p>
      </div>
    );
  }

  const chartMinWidth = Math.max(1800, orderedTraces.length * 12);

  return (
    <div className="card analysis-section-card">
      <div className="analysis-panel-head">
        <h2>Telemetry Overlay</h2>

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

  return (
    <LiveSessionTelemetryPanel
      session={session}
      apiBase={API_BASE}
      trackKey={trackKey}
      mapImageUrl={getDefaultMapImage(trackKey)}
    />
  );
}

function PostSessionPanel({ details }) {
  const navigate = useNavigate();
  const { session, stats, traces, report } = details;
  const laps = useMemo(() => normalizeSessionLaps(details.laps || []), [details.laps]);
  const signals = report?.topCoachSignals || [];
  const findings = report?.precisionFindings || [];
  const startedAt = formatDateTime(getSessionStartedAt(session));
  const endedAt = formatDateTime(getSessionEndedAt(session));

  return (
    <>
      <div className="card analysis-summary-card">
        <div className="analysis-summary-head">
          <div>
            <h2>{session.trackName || "Unknown Track"} | Full Session</h2>
            <p className="analysis-muted">
              {session.username || "Unknown Driver"} | {startedAt} to {endedAt}
            </p>
          </div>
          <span className="analysis-status-pill">Post Session</span>
        </div>

        <div className="analysis-stat-grid">
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
      </div>

      {(signals.length > 0 || findings.length > 0) && (
        <div className="card analysis-section-card">
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

      <div className="card analysis-section-card">
        <h2>Lap Breakdown</h2>
        {laps.length === 0 ? (
          <p className="analysis-muted">No laps were saved for this session.</p>
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

function AiCoachPill({ session, report, onViewAnalysis, viewAnalysisBtnRef }) {
  const aiStatus = session?.aiCoachResponseStatus;
  const reportStatus = session?.postSessionReportStatus;

  // Show the pill once the post-session report exists (ready/building) or AI response is tracked
  const hasReport = reportStatus === "ready" || reportStatus === "building";
  if (!aiStatus && !hasReport) return null;

  const isProcessing =
    aiStatus === "processing" ||
    (!aiStatus && reportStatus === "building");

  const isReady = aiStatus === "ready";

  return (
    <div className="ai-coach-pill" data-status={isReady ? "ready" : isProcessing ? "processing" : "idle"}>
      {isProcessing && (
        <>
          <span className="ai-coach-pill-spinner" />
          <span className="ai-coach-pill-text">Generating Your Analysis</span>
          <button className="ai-coach-pill-btn" disabled>
            View Analysis
          </button>
        </>
      )}
      {isReady && (
        <>
          <svg
            className="ai-coach-pill-check"
            viewBox="0 0 20 20"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="ai-coach-pill-text">Analysis Ready</span>
          <button
            ref={viewAnalysisBtnRef}
            className="ai-coach-pill-btn"
            onClick={onViewAnalysis}
          >
            View Analysis
          </button>
        </>
      )}
      {!isProcessing && !isReady && (
        <>
          <svg
            className="ai-coach-pill-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
          </svg>
          <span className="ai-coach-pill-text">AI Driving Coach</span>
          <button className="ai-coach-pill-btn" disabled>
            View Analysis
          </button>
        </>
      )}
    </div>
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aiCoachContent, setAiCoachContent] = useState(null);
  const viewAnalysisBtnRef = useRef(null);

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

  const handleOpenDrawer = useCallback(async () => {
    setDrawerOpen(true);
    if (aiCoachContent) return; // already loaded

    try {
      const res = await fetch(
        `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/reports/post-session`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setAiCoachContent(data.aiCoachResponse || null);
      }
    } catch (err) {
      console.error("Failed to load AI coach response:", err);
    }
  }, [sessionId, aiCoachContent]);

  return (
    <div className="page-container lap-performance-page session-details-page">
      <div className="analysis-page-header">
        <div>
          <h1>
            Session <span className={active ? "text-green" : "text-blue"}>{active ? "Live" : "Review"}</span>
          </h1>
          <p className="analysis-muted">
            {shownSession.trackName || "Unknown Track"} | {shownSession.username || "Unknown Driver"} | Started {formatDateTime(getSessionStartedAt(shownSession))}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <AiCoachPill
            session={shownSession}
            onViewAnalysis={handleOpenDrawer}
            viewAnalysisBtnRef={viewAnalysisBtnRef}
          />
          <Link
            to="/live"
            className="analysis-back-link"
          >
            Back to Sessions
          </Link>
        </div>
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

      <AiCoachDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        reportContent={aiCoachContent}
        triggerRef={viewAnalysisBtnRef}
      />
    </div>
  );
}

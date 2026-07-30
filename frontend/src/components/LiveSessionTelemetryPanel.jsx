/**
 * LiveSessionTelemetryPanel.jsx — Real-time Telemetry Dashboard
 * ===============================================================
 * The main live telemetry display component. Shows real-time data from
 * the local Python listener (via SSE stream) or falls back to Firestore
 * cloud data. Includes:
 * 
 * - Live telemetry stats grid (speed, gear, RPM, throttle, brake, etc.)
 * - Live steering wheel visualisation with pedal bars
 * - Rolling live graph (5-second window of speed/throttle/brake/RPM/gear/DRS)
 * - Track map with live car position dot
 * - Lap trail selector for reviewing completed laps
 * 
 * Data flow priority:
 * 1. Local SSE stream (fastest, ~60Hz from listener)
 * 2. Local HTTP polling (fallback if SSE not available)
 * 3. Firestore cloud data (slowest, ~1Hz backup)
 * 
 * Uses requestAnimationFrame for smooth 60fps stat updates without
 * causing React re-renders on every telemetry sample.
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import TrackTelemetryMap from "./TrackTelemetryMap";
import TelemetryChart from "./TelemetryChart";
import { LiveSteeringWheel } from "./SteeringWheel";
import {
  getLocalListenerLiveSample,
  subscribeLocalListenerLive,
} from "../services/localListenerService";
import {
  formatSessionFlag,
  getSessionEndedAt,
  getSessionStartedAt,
  isActiveSession,
} from "../utils/sessionUtils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

const LIVE_GRAPH_WINDOW_MS = 5000;
const LIVE_GRAPH_MAX_POINTS = 600;
const LIVE_GRAPH_RENDER_TICK_MS = 48;
const LOCAL_LIVE_POLL_INTERVAL_MS = 16;
const LIVE_FEED_LABELS = {
  waiting: "Waiting",
  stream: "Local stream",
  poll: "Local poll",
  cloud: "Cloud backup",
};
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

function formatFixed(value, digits = 1, fallback = "-") {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
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
    localSequence: Number.isFinite(Number(sample.localSequence ?? sample.liveSequence))
      ? Number(sample.localSequence ?? sample.liveSequence)
      : null,
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

  for (const key of ["localSequence", "sampleIndex", "gameTimeMs", "timestampMs"]) {
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

function mergeFreshLiveTelemetry(session) {
  const telemetry = session?.latestTelemetry || null;
  const mapPosition = session?.latestMapPosition || null;

  if (!telemetry) return mapPosition;
  if (!mapPosition) return telemetry;

  const telemetryFreshness = readTelemetryFreshness(telemetry);
  const mapFreshness = readTelemetryFreshness(mapPosition);
  const mapIsAtLeastAsFresh =
    compareTelemetryFreshness(mapFreshness, telemetryFreshness) >= 0;

  if (mapIsAtLeastAsFresh) {
    return {
      ...telemetry,
      ...mapPosition,
      rpm: telemetry.rpm ?? telemetry.engineRPM ?? mapPosition.rpm ?? mapPosition.engineRPM,
      engineRPM:
        telemetry.engineRPM ?? telemetry.rpm ?? mapPosition.engineRPM ?? mapPosition.rpm,
      gear: telemetry.gear ?? mapPosition.gear,
      drs: telemetry.drs ?? mapPosition.drs,
    };
  }

  return {
    ...mapPosition,
    ...telemetry,
    worldX: telemetry.worldX ?? mapPosition.worldX,
    worldY: telemetry.worldY ?? mapPosition.worldY,
    worldZ: telemetry.worldZ ?? mapPosition.worldZ,
  };
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

function readLocalSequence(payload) {
  const sequence = Number(payload?.sequence);
  return Number.isFinite(sequence) ? sequence : null;
}

function getLiveFeedLabel(source) {
  return LIVE_FEED_LABELS[source] || source || LIVE_FEED_LABELS.waiting;
}

function getLiveFeedColor(source, ageMs) {
  if (source === "stream" && (ageMs == null || ageMs < 180)) return "#22c55e";
  if (source === "poll" && (ageMs == null || ageMs < 300)) return "#facc15";
  if (source === "cloud") return "#94a3b8";
  return "#f87171";
}

function formatFeedAge(ageMs) {
  if (ageMs == null) return "-";
  if (ageMs < 1000) return `${Math.round(ageMs)} ms`;
  return `${(ageMs / 1000).toFixed(1)} s`;
}

function buildLiveGraphDatasetPoints(metric, visiblePoints, renderClockMs) {
  const windowSeconds = LIVE_GRAPH_WINDOW_MS / 1000;
  const samples = visiblePoints
    .map((point) => ({
      x: Math.max(-windowSeconds, (point.receivedAtMs - renderClockMs) / 1000),
      y: liveGraphScaledValue(metric, point),
      sourcePoint: point,
    }))
    .filter((point) => point.y !== null);

  if (samples.length === 0) return [];

  const first = samples[0];
  const last = samples[samples.length - 1];
  const anchoredSamples = [...samples];

  if (first.x > -windowSeconds) {
    anchoredSamples.unshift({
      x: -windowSeconds,
      y: first.y,
      sourcePoint: first.sourcePoint,
      edgePoint: true,
    });
  }

  if (last.x < 0) {
    anchoredSamples.push({
      x: 0,
      y: last.y,
      sourcePoint: last.sourcePoint,
      edgePoint: true,
    });
  }

  return anchoredSamples;
}

const LiveTelemetryGraph = memo(function LiveTelemetryGraph({ points }) {
  const [visibleMetrics, setVisibleMetrics] = useState(() =>
    LIVE_GRAPH_METRICS.reduce((next, metric) => {
      next[metric.key] = metric.defaultVisible;
      return next;
    }, {})
  );
  const [renderClockMs, setRenderClockMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRenderClockMs(Date.now());
    }, LIVE_GRAPH_RENDER_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  const visiblePoints = useMemo(() => {
    const cutoff = renderClockMs - LIVE_GRAPH_WINDOW_MS;
    return points.filter((point) => {
      return point.receivedAtMs >= cutoff && point.receivedAtMs <= renderClockMs + 500;
    });
  }, [points, renderClockMs]);

  const chartData = useMemo(
    () => ({
      datasets: LIVE_GRAPH_METRICS.filter((metric) => visibleMetrics[metric.key]).map((metric) => ({
        label: metric.label,
        data: buildLiveGraphDatasetPoints(metric, visiblePoints, renderClockMs),
        borderColor: metric.color,
        backgroundColor: metric.color,
        borderWidth: metric.key === "speedKph" ? 2.5 : 2,
        borderCapStyle: "round",
        borderJoinStyle: "round",
        cubicInterpolationMode: metric.stepped ? "default" : "monotone",
        pointRadius: 0,
        tension: metric.stepped ? 0 : 0.22,
        stepped: metric.stepped || false,
        spanGaps: true,
        clip: false,
        metricKey: metric.key,
      })),
    }),
    [renderClockMs, visibleMetrics, visiblePoints]
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
          type: "linear",
          min: -LIVE_GRAPH_WINDOW_MS / 1000,
          max: 0,
          ticks: {
            color: "#94a3b8",
            maxTicksLimit: 6,
            callback: (value) => {
              const n = Number(value);
              if (!Number.isFinite(n)) return "";
              return n === 0 ? "now" : `${n.toFixed(0)}s`;
            },
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
            title(items) {
              const x = Number(items[0]?.raw?.x);
              if (!Number.isFinite(x)) return "";
              return x >= -0.05 ? "now" : `${Math.abs(x).toFixed(1)}s ago`;
            },
            label(context) {
              const metric = LIVE_GRAPH_METRICS.find(
                (item) => item.key === context.dataset.metricKey
              );
              const point = context.raw?.sourcePoint || {};
              if (!metric) return context.dataset.label + ": -";
              return (
                metric.label +
                ": " +
                liveGraphValueLabel(metric, liveGraphRawValue(metric, point))
              );
            },
            afterBody(items) {
              const point = items[0]?.raw?.sourcePoint || {};
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
    []
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

      <div className="live-telemetry-graph-wrap">
        {visiblePoints.length < 2 ? (
          <div className="live-telemetry-graph-placeholder">
            Waiting for live telemetry samples. The graph appears once the listener sends a few updates.
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
});

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

const FastLiveTelemetryCard = memo(function FastLiveTelemetryCard({
  telemetryRef,
  fallbackTelemetry,
  liveFeedStatus,
}) {
  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <h2 style={{ marginBottom: 0 }}>Current Telemetry</h2>
        <span
          title="Shows whether this page is using the instant local listener stream, local polling, or slower cloud backup data."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 9px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            color: "#e5e7eb",
            fontSize: 12,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: getLiveFeedColor(liveFeedStatus.source, liveFeedStatus.ageMs),
              boxShadow:
                "0 0 12px " +
                getLiveFeedColor(liveFeedStatus.source, liveFeedStatus.ageMs),
            }}
          />
          {getLiveFeedLabel(liveFeedStatus.source)}
          {" | "}
          Telemetry{" "}
          {liveFeedStatus.telemetryHz > 0
            ? liveFeedStatus.telemetryHz.toFixed(0)
            : liveFeedStatus.hz > 0
              ? liveFeedStatus.hz.toFixed(0)
              : "-"}{" "}
          Hz
          {" | "}
          {formatFeedAge(liveFeedStatus.ageMs)}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          alignItems: "center",
        }}
      >
        <LiveSteeringWheel
          telemetryRef={telemetryRef}
          fallbackTelemetry={fallbackTelemetry}
          label="Live Steering"
          size={152}
        />
        <FastTelemetryStatsGrid
          telemetryRef={telemetryRef}
          fallbackTelemetry={fallbackTelemetry}
        />
      </div>
    </div>
  );
});

const FastTelemetryStatsGrid = memo(function FastTelemetryStatsGrid({
  telemetryRef,
  fallbackTelemetry,
}) {
  const valueRefs = useRef({});

  function setValue(key, value) {
    const node = valueRefs.current[key];
    if (node && node.textContent !== value) {
      node.textContent = value;
    }
  }

  useEffect(() => {
    let frameId = 0;
    let lastUpdatedAt = 0;

    function updateStats(now) {
      if (now - lastUpdatedAt >= 33) {
        lastUpdatedAt = now;
        const telemetry = telemetryRef?.current || fallbackTelemetry || null;
        const throttlePct = readPercentMetric(telemetry, "throttlePct", "throttle");
        const brakePct = readPercentMetric(telemetry, "brakePct", "brake");
        const rpm = telemetry?.rpm ?? telemetry?.engineRPM;
        const drsOn = telemetry?.drs === true || telemetry?.drs === 1;

        setValue("speed", `${formatFixed(telemetry?.speedKph, 0, "0")} km/h`);
        setValue("gear", telemetry?.gear == null ? "-" : String(telemetry.gear));
        setValue("rpm", rpm == null ? "0" : String(rpm));
        setValue("throttle", `${formatFixed(throttlePct, 0, "0")}%`);
        setValue("brake", `${formatFixed(brakePct, 0, "0")}%`);
        setValue("steering", formatFixed(telemetry?.steering, 2, "0.00"));
        setValue("drs", drsOn ? "On" : "Off");
        setValue("lap", telemetry?.lapNumber == null ? "-" : String(telemetry.lapNumber));
        setValue("delta", `${telemetry?.deltaToPB ?? "-"} ms`);
        setValue(
          "cornering",
          telemetry?.corneringSpeed == null ? "-" : `${telemetry.corneringSpeed} km/h`
        );
        setValue(
          "braking",
          telemetry?.brakingDistance == null
            ? "-"
            : `${formatFixed(telemetry.brakingDistance, 1)} m`
        );
        setValue("worldX", formatFixed(telemetry?.worldX, 2));
        setValue("worldZ", formatFixed(telemetry?.worldZ, 2));
      }

      frameId = window.requestAnimationFrame(updateStats);
    }

    frameId = window.requestAnimationFrame(updateStats);
    return () => window.cancelAnimationFrame(frameId);
  }, [fallbackTelemetry, telemetryRef]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 8,
      }}
    >
      <p><strong>Speed:</strong> <span ref={(node) => { valueRefs.current.speed = node; }}>0 km/h</span></p>
      <p><strong>Gear:</strong> <span ref={(node) => { valueRefs.current.gear = node; }}>-</span></p>
      <p><strong>RPM:</strong> <span ref={(node) => { valueRefs.current.rpm = node; }}>0</span></p>
      <p><strong>Throttle:</strong> <span ref={(node) => { valueRefs.current.throttle = node; }}>0%</span></p>
      <p><strong>Brake:</strong> <span ref={(node) => { valueRefs.current.brake = node; }}>0%</span></p>
      <p><strong>Steering:</strong> <span ref={(node) => { valueRefs.current.steering = node; }}>0.00</span></p>
      <p><strong>DRS:</strong> <span ref={(node) => { valueRefs.current.drs = node; }}>Off</span></p>
      <p><strong>Lap:</strong> <span ref={(node) => { valueRefs.current.lap = node; }}>-</span></p>
      <p><strong>Delta to PB:</strong> <span ref={(node) => { valueRefs.current.delta = node; }}>- ms</span></p>
      <p><strong>Cornering Speed:</strong> <span ref={(node) => { valueRefs.current.cornering = node; }}>-</span></p>
      <p><strong>Braking Distance:</strong> <span ref={(node) => { valueRefs.current.braking = node; }}>-</span></p>
      <p><strong>World X:</strong> <span ref={(node) => { valueRefs.current.worldX = node; }}>-</span></p>
      <p><strong>World Z:</strong> <span ref={(node) => { valueRefs.current.worldZ = node; }}>-</span></p>
    </div>
  );
});

export default function LiveSessionTelemetryPanel({
  session,
  apiBase,
  trackKey,
  mapImageUrl,
}) {
  const [liveSession, setLiveSession] = useState(session || null);
  const [liveGraphPoints, setLiveGraphPoints] = useState([]);
  const [liveFeedStatus, setLiveFeedStatus] = useState({
    source: "waiting",
    hz: 0,
    telemetryHz: 0,
    ageMs: null,
  });
  const [selectedTrailKey, setSelectedTrailKey] = useState("current");
  const [mapTrailState, setMapTrailState] = useState(() =>
    createEmptyMapTrailState()
  );
  const lastTelemetryFreshnessRef = useRef(null);
  const lastLiveGraphPointRef = useRef(null);
  const liveTelemetryRef = useRef(mergeFreshLiveTelemetry(session));
  const liveGraphPointsRef = useRef([]);
  const graphFlushTimerRef = useRef(0);
  const streamHealthyRef = useRef(false);
  const lastStreamSampleAtRef = useRef(0);
  const liveFeedStatsRef = useRef({
    source: "waiting",
    count: 0,
    telemetryCount: 0,
    windowStartedAt: 0,
    lastAt: 0,
    hz: 0,
    telemetryHz: 0,
  });

  function resetLiveGraphTrace() {
    lastTelemetryFreshnessRef.current = null;
    lastLiveGraphPointRef.current = null;
    liveGraphPointsRef.current = [];
    liveTelemetryRef.current = null;
    if (graphFlushTimerRef.current) {
      window.clearTimeout(graphFlushTimerRef.current);
      graphFlushTimerRef.current = 0;
    }
    liveFeedStatsRef.current = {
      source: "waiting",
      count: 0,
      telemetryCount: 0,
      windowStartedAt: 0,
      lastAt: 0,
      hz: 0,
      telemetryHz: 0,
    };
    setLiveGraphPoints([]);
    setLiveFeedStatus({
      source: "waiting",
      hz: 0,
      telemetryHz: 0,
      ageMs: null,
    });
  }

  function scheduleGraphFlush() {
    if (graphFlushTimerRef.current) return;

    graphFlushTimerRef.current = window.setTimeout(() => {
      graphFlushTimerRef.current = 0;
      setLiveGraphPoints(liveGraphPointsRef.current);
    }, LIVE_GRAPH_RENDER_TICK_MS);
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
    const cutoff = point.receivedAtMs - LIVE_GRAPH_WINDOW_MS;
    liveGraphPointsRef.current = [...liveGraphPointsRef.current, point]
      .filter((item) => item.receivedAtMs >= cutoff)
      .slice(-LIVE_GRAPH_MAX_POINTS);
    scheduleGraphFlush();
  }

  function markLiveFeed(source, isFullTelemetry = true) {
    const now = window.performance.now();
    const current = liveFeedStatsRef.current;
    const sourceChanged = current.source !== source;
    const windowElapsed = current.windowStartedAt
      ? now - current.windowStartedAt
      : 0;

    if (sourceChanged || !current.windowStartedAt || windowElapsed >= 1000) {
      const hz =
        !sourceChanged && current.count > 0 && windowElapsed > 0
          ? (current.count * 1000) / windowElapsed
          : 0;
      const telemetryHz =
        !sourceChanged && current.telemetryCount > 0 && windowElapsed > 0
          ? (current.telemetryCount * 1000) / windowElapsed
          : 0;
      liveFeedStatsRef.current = {
        source,
        count: 1,
        telemetryCount: isFullTelemetry ? 1 : 0,
        windowStartedAt: now,
        lastAt: now,
        hz,
        telemetryHz,
      };
      setLiveFeedStatus({
        source,
        hz,
        telemetryHz,
        ageMs: 0,
      });
      return;
    }

    liveFeedStatsRef.current = {
      ...current,
      count: current.count + 1,
      telemetryCount: current.telemetryCount + (isFullTelemetry ? 1 : 0),
      lastAt: now,
    };
  }

  function applyLocalLivePayload(payload, source = "poll") {
    if (!payload || payload.sessionId !== session?.id) return false;

    const mergedTelemetry = mergeFreshLiveTelemetry(payload);
    if (!mergedTelemetry) return false;

    const localSequence = readLocalSequence(payload);
    const latestTelemetry = {
      ...mergedTelemetry,
      ...(localSequence == null ? {} : { localSequence }),
      liveFeedSource: source,
      liveUpdatedAt: payload.updatedAt || mergedTelemetry.timestamp,
    };
    markLiveFeed(source, !latestTelemetry.motionOnly);

    const freshness = readTelemetryFreshness(latestTelemetry);
    const freshnessDelta = compareTelemetryFreshness(
      freshness,
      lastTelemetryFreshnessRef.current
    );

    if (freshnessDelta <= 0) return true;

    lastTelemetryFreshnessRef.current = freshness;
    liveTelemetryRef.current = latestTelemetry;
    if (!latestTelemetry.motionOnly) {
      appendLiveGraphPoint(latestTelemetry, freshness);
    }
    return true;
  }

  useEffect(() => {
    resetLiveGraphTrace();
    setSelectedTrailKey("current");
    setMapTrailState(createEmptyMapTrailState());
    setLiveSession(session || null);
    liveTelemetryRef.current = mergeFreshLiveTelemetry(session);
  }, [session?.id]);

  useEffect(() => {
    if (!session?.id) {
      setLiveSession(null);
      liveTelemetryRef.current = null;
      return;
    }

    const latestTelemetry = mergeFreshLiveTelemetry(session);

    if (!latestTelemetry) {
      setLiveSession(session);
      liveTelemetryRef.current = null;
      return;
    }

    if (
      streamHealthyRef.current &&
      window.performance.now() - lastStreamSampleAtRef.current < 750
    ) {
      setLiveSession((current) => {
        if (!current || current.id !== session.id) return session;
        return {
          ...session,
          latestTelemetry: current.latestTelemetry,
          latestMapPosition: current.latestMapPosition,
        };
      });
      return;
    }

    const freshness = readTelemetryFreshness(latestTelemetry);
    const freshnessDelta = compareTelemetryFreshness(
      freshness,
      lastTelemetryFreshnessRef.current
    );

    if (freshnessDelta < 0) {
      setLiveSession((current) => {
        if (!current || current.id !== session.id) return session;
        return {
          ...session,
          latestTelemetry: current.latestTelemetry,
          latestMapPosition: current.latestMapPosition,
        };
      });
      return;
    }

    setLiveSession(session);
    liveTelemetryRef.current = latestTelemetry;

    if (freshnessDelta > 0) {
      lastTelemetryFreshnessRef.current = freshness;
      if (!streamHealthyRef.current) {
        markLiveFeed("cloud", true);
      }
      if (!latestTelemetry.motionOnly) {
        appendLiveGraphPoint(latestTelemetry, freshness);
      }
    }
  }, [session]);

  useEffect(() => {
    if (!session?.id) return undefined;

    const trimTimer = window.setInterval(() => {
      const cutoff = Date.now() - LIVE_GRAPH_WINDOW_MS;
      const next = liveGraphPointsRef.current.filter((point) => point.receivedAtMs >= cutoff);
      liveGraphPointsRef.current = next;
      setLiveGraphPoints(next);
    }, 500);

    return () => window.clearInterval(trimTimer);
  }, [session?.id]);

  useEffect(() => {
    return () => {
      if (graphFlushTimerRef.current) {
        window.clearTimeout(graphFlushTimerRef.current);
      }
    };
  }, []);

  const selectedSessionActive = isActiveSession(liveSession || session);

  useEffect(() => {
    if (!session?.id || !selectedSessionActive) return undefined;

    streamHealthyRef.current = false;
    lastStreamSampleAtRef.current = 0;

    const subscription = subscribeLocalListenerLive({
      onSample(payload) {
        if (payload?.sessionId !== session.id) return;
        if (applyLocalLivePayload(payload, "stream")) {
          streamHealthyRef.current = true;
          lastStreamSampleAtRef.current = window.performance.now();
        }
      },
      onError() {
        streamHealthyRef.current = false;
      },
    });

    if (!subscription.supported) {
      streamHealthyRef.current = false;
    }

    return () => {
      subscription.close();
      streamHealthyRef.current = false;
    };
  }, [selectedSessionActive, session?.id]);

  useEffect(() => {
    if (!session?.id || !selectedSessionActive) return undefined;

    let cancelled = false;
    let localFetchInFlight = false;
    let failureCount = 0;
    let timerId = 0;

    async function pollLocalLive() {
      if (cancelled || localFetchInFlight) return;

      if (
        streamHealthyRef.current &&
        window.performance.now() - lastStreamSampleAtRef.current < 750
      ) {
        timerId = window.setTimeout(pollLocalLive, 750);
        return;
      }

      localFetchInFlight = true;
      const pollStartedAt = window.performance.now();

      try {
        const payload = await getLocalListenerLiveSample(140);
        if (cancelled) return;
        failureCount = applyLocalLivePayload(payload, "poll") ? 0 : Math.min(failureCount + 1, 10);
      } catch {
        if (!cancelled) {
          failureCount = Math.min(failureCount + 1, 10);
        }
      } finally {
        localFetchInFlight = false;
        if (!cancelled) {
          const elapsedMs = window.performance.now() - pollStartedAt;
          timerId = window.setTimeout(
            pollLocalLive,
            failureCount > 2
              ? 500
              : Math.max(0, LOCAL_LIVE_POLL_INTERVAL_MS - elapsedMs)
          );
        }
      }
    }

    pollLocalLive();

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [selectedSessionActive, session?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stats = liveFeedStatsRef.current;
      setLiveFeedStatus((current) => ({
        source: stats.source || current.source,
        hz: stats.hz ?? current.hz,
        telemetryHz: stats.telemetryHz ?? current.telemetryHz,
        ageMs: stats.lastAt ? window.performance.now() - stats.lastAt : null,
      }));
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

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

  const shownSession = liveSession || session || {};
  const activeTrailKey = selectedLapOption?.key || "current";
  const selectedLapNumber = selectedLapOption?.lapNumber ?? null;
  const fallbackLiveTelemetry = useMemo(
    () => mergeFreshLiveTelemetry(shownSession) || shownSession.latestMapPosition || null,
    [shownSession]
  );

  return (
    <>
      <div className="card analysis-summary-card">
        <div className="analysis-summary-head">
          <div>
            <h2>{shownSession.trackName || "Unknown Track"} | Live Session</h2>
            <p className="analysis-muted">
              {shownSession.username || "Unknown Driver"} | Started {formatDate(getSessionStartedAt(shownSession))}
            </p>
          </div>
          <span className="analysis-status-pill">Live</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <FastLiveTelemetryCard
          telemetryRef={liveTelemetryRef}
          fallbackTelemetry={fallbackLiveTelemetry}
          liveFeedStatus={liveFeedStatus}
        />

        <div className="card">
          <h2>Session Info</h2>
          <p><strong>Driver:</strong> {shownSession.username || "-"}</p>
          <p><strong>Track:</strong> {shownSession.trackName || "-"}</p>
          <p><strong>Session ID:</strong> {shownSession.id || "-"}</p>
          <p><strong>Track Key:</strong> {trackKey || "-"}</p>
          <p><strong>Custom Setup:</strong> {formatSessionFlag(shownSession.customSetup)}</p>
          <p><strong>Equal Performance:</strong> {formatSessionFlag(shownSession.equalPerformance)}</p>
          <p><strong>Started:</strong> {formatDate(getSessionStartedAt(shownSession))}</p>
          <p><strong>Ended:</strong> {formatDate(getSessionEndedAt(shownSession))}</p>
          <p><strong>Latest update:</strong> {formatDate(shownSession.latestTelemetryAt || shownSession.updatedAt)}</p>
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

        {trackKey ? (
          <TrackTelemetryMap
            apiBase={apiBase}
            sessionId={shownSession.id}
            trackKey={trackKey}
            mapImageUrl={mapImageUrl}
            selectedTrailKey={activeTrailKey}
            liveMapPositionRef={liveTelemetryRef}
            onTrailOptionsChange={setMapTrailState}
          />
        ) : (
          <p className="analysis-muted">No track key found for this session.</p>
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
            apiBase={apiBase}
            sessionId={shownSession.id}
            selectedLapNumber={selectedLapNumber}
          />
        </div>
      </div>

      <LiveTelemetryGraph points={liveGraphPoints} />
    </>
  );
}

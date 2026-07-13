import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import PostLapTelemetryMap from "../components/PostLapTelemetryMap";
import SteeringWheel from "../components/SteeringWheel";

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

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");
  return token ? { Authorization: "Bearer " + token } : {};
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
  if (Math.abs(value) < 0.5) return "PB";
  const sign = value > 0 ? "+" : "-";
  return sign + formatLapTime(Math.abs(value));
}

function deltaColor(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "#cbd5e1";
  if (value < -0.5) return "#a855f7";
  if (Math.abs(value) < 0.5) return "#22c55e";
  if (value <= 500) return "#facc15";
  return "#f87171";
}

function formatNumber(value, digits = 1, suffix = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits) + suffix;
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function StatBox({ label, value, subvalue, color }) {
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 13 }}>{label}</div>
      <div style={{ color: color || "white", fontSize: 22, fontWeight: 700 }}>
        {value}
      </div>
      {subvalue && <div style={{ color: "#94a3b8", fontSize: 12 }}>{subvalue}</div>}
    </div>
  );
}

const GRAPH_METRICS = [
  {
    key: "speed",
    label: "Speed",
    unit: "km/h",
    color: "#38bdf8",
    max: 360,
    defaultVisible: true,
  },
  {
    key: "throttle",
    label: "Throttle",
    unit: "%",
    color: "#22c55e",
    max: 100,
    defaultVisible: true,
  },
  {
    key: "brake",
    label: "Brake",
    unit: "%",
    color: "#f87171",
    max: 100,
    defaultVisible: true,
  },
  {
    key: "rpm",
    label: "RPM",
    unit: "rpm",
    color: "#facc15",
    max: 13000,
    defaultVisible: true,
  },
  {
    key: "gear",
    label: "Gear",
    unit: "",
    color: "#a78bfa",
    max: 8,
    defaultVisible: true,
    stepped: true,
  },
  {
    key: "drs",
    label: "DRS",
    unit: "",
    color: "#fb7185",
    max: 1,
    defaultVisible: false,
    stepped: true,
  },
];

function graphRawValue(metricKey, sample) {
  if (metricKey === "speed") return sample.speedKph ?? null;
  if (metricKey === "throttle") return sample.throttlePct ?? null;
  if (metricKey === "brake") return sample.brakePct ?? null;
  if (metricKey === "rpm") return sample.rpm ?? null;
  if (metricKey === "gear") return sample.gear ?? null;
  if (metricKey === "drs") return sample.drs ? 1 : 0;
  return null;
}

function graphValueLabel(metric, raw) {
  if (raw === null || raw === undefined) return "-";

  if (metric.key === "drs") {
    return raw ? "On" : "Off";
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) return "-";

  if (metric.key === "rpm" || metric.key === "gear") {
    return Math.round(value).toString() + (metric.unit ? " " + metric.unit : "");
  }

  return value.toFixed(1) + (metric.unit ? " " + metric.unit : "");
}

function graphScaledValue(metric, sample) {
  const raw = graphRawValue(metric.key, sample);
  if (raw === null || raw === undefined) return null;

  if (metric.key === "drs") {
    return raw ? 100 : 0;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;

  return Math.max(0, Math.min(100, (value / metric.max) * 100));
}

function buildSectorBoundaries(traces, lap) {
  const sectors = traces
    .map((sample) => Number(sample.sector))
    .filter(Number.isFinite);
  const zeroBased = sectors.includes(0);
  const boundaries = [];
  let previousSector = null;

  traces.forEach((sample, index) => {
    const sector = Number(sample.sector);
    if (!Number.isFinite(sector)) return;

    if (previousSector !== null && sector !== previousSector) {
      const sectorNumber = zeroBased ? sector + 1 : sector;
      if (sectorNumber >= 2 && sectorNumber <= 3) {
        boundaries.push({
          index,
          label: "S" + sectorNumber,
          color: sectorNumber === 2 ? "#facc15" : "#fb7185",
          approximate: false,
        });
      }
    }
    previousSector = sector;
  });

  if (boundaries.length >= 2 || traces.length < 3) {
    return boundaries.slice(0, 2);
  }

  const lapTime = Number(lap?.lapTimeMs);
  const sector1 = Number(lap?.sector1Ms);
  const sector2 = Number(lap?.sector2Ms);
  if (
    !Number.isFinite(lapTime) ||
    lapTime <= 0 ||
    !Number.isFinite(sector1) ||
    !Number.isFinite(sector2)
  ) {
    return boundaries;
  }

  const fallback = [
    {
      index: Math.round((sector1 / lapTime) * (traces.length - 1)),
      label: "S2",
      color: "#facc15",
      approximate: true,
    },
    {
      index: Math.round(((sector1 + sector2) / lapTime) * (traces.length - 1)),
      label: "S3",
      color: "#fb7185",
      approximate: true,
    },
  ];

  return fallback.map((item) => {
    return boundaries.find((boundary) => boundary.label === item.label) || item;
  });
}


const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4];
const REPLAY_SEEK_MS = 5000;

function sampleTimestampMs(sample) {
  const value = sample?.timestamp;
  if (!value) return null;

  if (typeof value === "number") {
    return value > 100000000000 ? value : value * 1000;
  }

  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  if (Number.isFinite(Number(value._seconds))) return Number(value._seconds) * 1000;

  return null;
}

function buildReplayTimeline(traces, lap) {
  if (!Array.isArray(traces) || traces.length === 0) return [];
  if (traces.length === 1) return [0];

  const timestamps = traces.map(sampleTimestampMs);
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps[timestamps.length - 1];

  if (
    timestamps.every((value) => Number.isFinite(value)) &&
    Number.isFinite(firstTimestamp) &&
    Number.isFinite(lastTimestamp) &&
    lastTimestamp > firstTimestamp
  ) {
    let previous = 0;
    return timestamps.map((value) => {
      const next = Math.max(previous, value - firstTimestamp);
      previous = next;
      return next;
    });
  }

  const lapTime = Number(lap?.lapTimeMs);
  const duration = Number.isFinite(lapTime) && lapTime > 0
    ? lapTime
    : Math.max(1000, (traces.length - 1) * 100);

  return traces.map((_, index) => (duration * index) / (traces.length - 1));
}

function replayIndexForTime(timeline, timeMs) {
  const position = replayPositionForTime(timeline, timeMs);
  return Number.isFinite(position) ? Math.floor(position) : null;
}

function replayPositionForTime(timeline, timeMs) {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;

  const target = Math.max(0, Number(timeMs) || 0);
  if (timeline.length === 1 || target <= timeline[0]) return 0;
  if (target >= timeline[timeline.length - 1]) return timeline.length - 1;

  let low = 0;
  let high = timeline.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (timeline[mid] <= target) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const nextIndex = Math.min(low + 1, timeline.length - 1);
  const span = timeline[nextIndex] - timeline[low];
  if (!Number.isFinite(span) || span <= 0) return low;

  return low + Math.max(0, Math.min(1, (target - timeline[low]) / span));
}

const REPLAY_NUMERIC_FIELDS = [
  "index",
  "sampleIndex",
  "lapDistance",
  "distanceM",
  "worldX",
  "worldY",
  "worldZ",
  "steering",
  "speedKph",
  "throttlePct",
  "brakePct",
  "rpm",
  "gear",
  "deltaToPB",
  "corneringSpeedKph",
  "brakingDistanceM",
];

function lerpNumber(a, b, amount) {
  const from = Number(a);
  const to = Number(b);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    return from + (to - from) * amount;
  }
  if (Number.isFinite(from)) return from;
  if (Number.isFinite(to)) return to;
  return null;
}

function interpolateReplaySample(traces, position) {
  if (!Array.isArray(traces) || traces.length === 0) return null;

  const rawPosition = Number(position);
  const clamped = Number.isFinite(rawPosition)
    ? Math.max(0, Math.min(rawPosition, traces.length - 1))
    : 0;
  const leftIndex = Math.floor(clamped);
  const rightIndex = Math.min(leftIndex + 1, traces.length - 1);
  const amount = rightIndex === leftIndex ? 0 : clamped - leftIndex;
  const left = traces[leftIndex] || {};
  const right = traces[rightIndex] || left;
  const next = {
    ...left,
    index: clamped,
  };

  for (const key of REPLAY_NUMERIC_FIELDS) {
    const value = lerpNumber(left[key], right[key], amount);
    if (value !== null) next[key] = value;
  }

  if (amount >= 0.5) {
    next.drs = right.drs;
    next.sector = right.sector;
  }

  return next;
}

function chartPixelForIndex(xScale, index) {
  const value = Number(index);
  if (!Number.isFinite(value)) return null;
  const left = Math.floor(value);
  const right = Math.ceil(value);
  if (left === right) return xScale.getPixelForValue(left);

  const leftPixel = xScale.getPixelForValue(left);
  const rightPixel = xScale.getPixelForValue(right);
  if (!Number.isFinite(leftPixel) || !Number.isFinite(rightPixel)) return null;
  return leftPixel + (rightPixel - leftPixel) * (value - left);
}

function clampReplayTime(value, duration) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.min(next, Math.max(0, duration || 0)));
}

function formatReplayClock(ms) {
  const value = Math.max(0, Number(ms) || 0);
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const fraction = Math.floor(value % 1000);
  return (
    minutes +
    ":" +
    seconds.toString().padStart(2, "0") +
    "." +
    fraction.toString().padStart(3, "0")
  );
}

function speedStep(currentSpeed, direction) {
  const index = REPLAY_SPEEDS.findIndex((speed) => speed === currentSpeed);
  const currentIndex = index >= 0 ? index : REPLAY_SPEEDS.indexOf(1);
  const nextIndex = Math.max(0, Math.min(REPLAY_SPEEDS.length - 1, currentIndex + direction));
  return REPLAY_SPEEDS[nextIndex];
}

function replayButtonStyle({ primary = false, disabled = false } = {}) {
  return {
    border: primary
      ? "1px solid var(--color-accent-green)"
      : "1px solid rgba(255,255,255,0.16)",
    background: primary
      ? "rgba(34,197,94,0.16)"
      : "rgba(255,255,255,0.05)",
    color: disabled ? "#64748b" : primary ? "#bbf7d0" : "white",
    padding: "8px 11px",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: primary ? 800 : 650,
  };
}

function ReplayControls({
  traces,
  replayTimeMs,
  replayDurationMs,
  replaySpeed,
  isReplaying,
  activeSample,
  onPlayPause,
  onRestart,
  onSeekBy,
  onSeekTo,
  onSpeedStep,
}) {
  const disabled = traces.length < 2 || replayDurationMs <= 0;
  const progress = disabled
    ? 0
    : Math.min(100, Math.max(0, (replayTimeMs / replayDurationMs) * 100));
  const playLabel = isReplaying
    ? "Pause"
    : replayTimeMs > 0 && replayTimeMs < replayDurationMs
      ? "Resume"
      : "Replay Lap";

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Lap Replay</h2>
          <p style={{ color: "#94a3b8", margin: "4px 0 0" }}>
            {disabled
              ? "Replay needs at least two saved telemetry samples."
              : formatReplayClock(replayTimeMs) + " / " + formatReplayClock(replayDurationMs)}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onRestart}
            disabled={disabled}
            style={replayButtonStyle({ disabled })}
          >
            Restart
          </button>
          <button
            type="button"
            onClick={() => onSeekBy(-REPLAY_SEEK_MS)}
            disabled={disabled}
            style={replayButtonStyle({ disabled })}
          >
            &lt;&lt; 5s
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            disabled={disabled}
            style={replayButtonStyle({ primary: true, disabled })}
          >
            {playLabel}
          </button>
          <button
            type="button"
            onClick={() => onSeekBy(REPLAY_SEEK_MS)}
            disabled={disabled}
            style={replayButtonStyle({ disabled })}
          >
            5s &gt;&gt;
          </button>
          <button
            type="button"
            onClick={() => onSpeedStep(-1)}
            disabled={disabled || replaySpeed <= REPLAY_SPEEDS[0]}
            style={replayButtonStyle({ disabled: disabled || replaySpeed <= REPLAY_SPEEDS[0] })}
          >
            Slower
          </button>
          <div
            style={{
              minWidth: 54,
              textAlign: "center",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#c4b5fd",
              fontWeight: 800,
            }}
          >
            {replaySpeed}x
          </div>
          <button
            type="button"
            onClick={() => onSpeedStep(1)}
            disabled={disabled || replaySpeed >= REPLAY_SPEEDS[REPLAY_SPEEDS.length - 1]}
            style={replayButtonStyle({ disabled: disabled || replaySpeed >= REPLAY_SPEEDS[REPLAY_SPEEDS.length - 1] })}
          >
            Faster
          </button>
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={Math.max(1, replayDurationMs)}
        step="25"
        value={clampReplayTime(replayTimeMs, replayDurationMs)}
        disabled={disabled}
        onChange={(event) => onSeekTo(Number(event.target.value))}
        style={{
          width: "100%",
          accentColor: "#a855f7",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />

      <div
        style={{
          height: 5,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
          marginTop: 8,
        }}
      >
        <div
          style={{
            width: progress + "%",
            height: "100%",
            background: "linear-gradient(90deg, #22c55e, #a855f7)",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginTop: 14,
          alignItems: "center",
        }}
      >
        <SteeringWheel
          steering={activeSample?.steering}
          throttle={activeSample?.throttlePct}
          brake={activeSample?.brakePct}
          label="Replay Steering"
          size={152}
          maxRotationDeg={240}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
            gap: 8,
            color: "#cbd5e1",
            fontSize: 13,
          }}
        >
          <div>Sample: <strong>{formatNumber(activeSample?.index, 1, "")}</strong></div>
          <div>Distance: <strong>{formatNumber(activeSample?.distanceM, 1, " m")}</strong></div>
          <div>Speed: <strong>{formatNumber(activeSample?.speedKph, 1, " km/h")}</strong></div>
          <div>Gear: <strong>{activeSample?.gear ?? "-"}</strong></div>
          <div>Brake: <strong>{formatNumber(activeSample?.brakePct, 0, "%")}</strong></div>
          <div>Throttle: <strong>{formatNumber(activeSample?.throttlePct, 0, "%")}</strong></div>
        </div>
      </div>
    </div>
  );
}

const telemetryGuidesPlugin = {
  id: "telemetryGuides",
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
      ctx.setLineDash([7, 6]);
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.lineWidth = 2;
      ctx.strokeStyle = boundary.color;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = boundary.color;
      ctx.font = "700 12px Arial";
      ctx.fillText(
        boundary.label + (boundary.approximate ? " ~" : ""),
        x + 5,
        chartArea.top + 15
      );
      ctx.restore();
    }

    if (Number.isFinite(Number(options.activeIndex))) {
      const x = chartPixelForIndex(xScale, options.activeIndex);
      if (Number.isFinite(x)) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.stroke();
        ctx.restore();
      }
    }
  },
};

function CombinedTelemetryGraph({
  labels,
  traces,
  visibleMetrics,
  onToggle,
  activeIndex,
  onHoverIndex,
  sectorBoundaries,
  autoScroll = false,
}) {
  const scrollRef = useRef(null);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: GRAPH_METRICS.filter((metric) => visibleMetrics[metric.key]).map((metric) => ({
        label: metric.label,
        data: traces.map((sample) => graphScaledValue(metric, sample)),
        borderColor: metric.color,
        backgroundColor: metric.color,
        borderWidth: metric.key === "drs" ? 1.5 : 2,
        pointRadius: 0,
        tension: metric.stepped ? 0 : 0.22,
        stepped: metric.stepped || false,
        spanGaps: true,
        metricKey: metric.key,
      })),
    }),
    [labels, traces, visibleMetrics]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      animation: false,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      onHover: (event, _elements, chart) => {
        const index = Math.round(chart.scales.x.getValueForPixel(event.x));
        if (Number.isFinite(index)) {
          onHoverIndex(Math.max(0, Math.min(traces.length - 1, index)));
        }
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
            label: (context) => {
              const metric = GRAPH_METRICS.find((item) => item.key === context.dataset.metricKey);
              const sample = traces[context.dataIndex] || {};
              if (!metric) return context.dataset.label + ": -";
              return metric.label + ": " + graphValueLabel(metric, graphRawValue(metric.key, sample));
            },
          },
        },
        telemetryGuides: {
          activeIndex,
          boundaries: sectorBoundaries,
        },
      },
    }),
    [activeIndex, onHoverIndex, sectorBoundaries, traces]
  );

  const chartMinWidth = Math.max(1080, labels.length * 5);

  useEffect(() => {
    if (!autoScroll || !Number.isFinite(Number(activeIndex)) || !scrollRef.current || labels.length < 2) {
      return;
    }

    const container = scrollRef.current;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const ratio = activeIndex / Math.max(1, labels.length - 1);
    const centeredLeft = ratio * container.scrollWidth - container.clientWidth * 0.45;
    const nextLeft = Math.max(0, Math.min(maxScroll, centeredLeft));
    container.scrollTo({ left: nextLeft, behavior: "auto" });
  }, [activeIndex, autoScroll, labels.length]);

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
                onChange={() => onToggle(metric.key)}
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

      <div ref={scrollRef} style={{ overflowX: "auto" }} onMouseLeave={() => onHoverIndex(null)}>
        <div style={{ minWidth: chartMinWidth, height: 430 }}>
          <Line
            data={chartData}
            options={options}
            plugins={[telemetryGuidesPlugin]}
          />
        </div>
      </div>
    </div>
  );
}

export default function LapPerformanceAnalysis() {
  const { sessionId, lapId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredSampleIndex, setHoveredSampleIndex] = useState(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayTimeMs, setReplayTimeMs] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function loadPerformance() {
      try {
        setLoading(true);
        setError("");

        const url =
          API_BASE +
          "/sessions/" +
          encodeURIComponent(sessionId) +
          "/laps/" +
          encodeURIComponent(lapId) +
          "/performance?maxSamples=420";
        const res = await fetch(url, {
          headers: getAuthHeaders(),
        });
        const body = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(body?.error || "Failed to load lap performance.");
        }

        if (!cancelled) {
          setData(body);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Lap performance load error:", err);
          setError(err.message || "Failed to load lap performance.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPerformance();

    return () => {
      cancelled = true;
    };
  }, [lapId, sessionId]);

  const traces = data?.traces || [];
  const labels = useMemo(() => {
    return traces.map((sample, index) => {
      if (Number.isFinite(Number(sample.distanceM))) {
        return Math.round(Number(sample.distanceM)) + "m";
      }
      return String(index + 1);
    });
  }, [traces]);

  const [visibleMetrics, setVisibleMetrics] = useState(() => {
    return GRAPH_METRICS.reduce((next, metric) => {
      next[metric.key] = metric.defaultVisible;
      return next;
    }, {});
  });

  function toggleMetric(metricKey) {
    setVisibleMetrics((current) => ({
      ...current,
      [metricKey]: current[metricKey] !== true,
    }));
  }

  const lap = data?.lap || {};
  const session = data?.session || {};
  const stats = data?.stats || {};
  const deltas = data?.deltas || {};
  const personalBest = data?.personalBest || null;
  const sectorDeltas = deltas.sectors || {};
  const sectorBoundaries = useMemo(
    () => buildSectorBoundaries(traces, lap),
    [lap.lapTimeMs, lap.sector1Ms, lap.sector2Ms, traces]
  );
  const replayTimeline = useMemo(
    () => buildReplayTimeline(traces, lap),
    [lap.lapTimeMs, traces]
  );
  const replayDurationMs = replayTimeline[replayTimeline.length - 1] || 0;
  const replayIndex = replayIndexForTime(replayTimeline, replayTimeMs);
  const replayPosition = replayPositionForTime(replayTimeline, replayTimeMs);
  const activeSampleIndex = hoveredSampleIndex ?? replayPosition ?? replayIndex;
  const activeSample = interpolateReplaySample(traces, activeSampleIndex);

  useEffect(() => {
    setIsReplaying(false);
    setReplayTimeMs(0);
    setReplaySpeed(1);
    setHoveredSampleIndex(null);
  }, [lapId, sessionId, traces.length]);

  useEffect(() => {
    if (!isReplaying || replayDurationMs <= 0 || traces.length < 2) return undefined;

    let frameId = 0;
    let previousFrameTime = window.performance.now();

    function tick(frameTime) {
      const frameDelta = Math.max(0, frameTime - previousFrameTime);
      previousFrameTime = frameTime;

      setReplayTimeMs((current) => {
        const next = clampReplayTime(current + frameDelta * replaySpeed, replayDurationMs);
        if (next >= replayDurationMs) {
          window.setTimeout(() => setIsReplaying(false), 0);
        }
        return next;
      });

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isReplaying, replayDurationMs, replaySpeed, traces.length]);

  function handleReplayPlayPause() {
    if (traces.length < 2 || replayDurationMs <= 0) return;

    setHoveredSampleIndex(null);
    if (!isReplaying && replayTimeMs >= replayDurationMs - 25) {
      setReplayTimeMs(0);
    }
    setIsReplaying((current) => !current);
  }

  function handleReplayRestart() {
    setHoveredSampleIndex(null);
    setReplayTimeMs(0);
    setIsReplaying(true);
  }

  function handleReplaySeekBy(deltaMs) {
    setHoveredSampleIndex(null);
    setReplayTimeMs((current) => clampReplayTime(current + deltaMs, replayDurationMs));
  }

  function handleReplaySeekTo(nextTimeMs) {
    setHoveredSampleIndex(null);
    setReplayTimeMs(clampReplayTime(nextTimeMs, replayDurationMs));
  }

  function handleReplaySpeedStep(direction) {
    setReplaySpeed((current) => speedStep(current, direction));
  }

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
            Lap <span className="text-blue">Performance</span>
          </h1>
          <p style={{ color: "#94a3b8", marginTop: 4 }}>
            Post-race analysis for one saved lap.
          </p>
        </div>
        <Link
          to="/leaderboard"
          style={{
            color: "white",
            textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          Back to Leaderboard
        </Link>
      </div>

      {loading && <p>Loading lap analysis...</p>}
      {error && <p style={{ color: "#f87171" }}>Error: {error}</p>}

      {!loading && !error && data && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2>
                  {session.trackName || "Unknown Track"} | Lap {lap.lapNumber ?? "-"}
                </h2>
                <p style={{ color: "#94a3b8", marginTop: 4 }}>
                  {session.username || "Unknown Driver"} | {formatDateTime(lap.recordedAt || session.startedAt)}
                </p>
              </div>

              <button
                type="button"
                disabled
                style={{
                  padding: "9px 13px",
                  borderRadius: 8,
                  border: stats.drs?.used
                    ? "1px solid var(--color-accent-green)"
                    : "1px solid rgba(255,255,255,0.16)",
                  background: stats.drs?.used
                    ? "rgba(34,197,94,0.16)"
                    : "rgba(255,255,255,0.05)",
                  color: stats.drs?.used ? "#86efac" : "#cbd5e1",
                  cursor: "default",
                }}
              >
                DRS {stats.drs?.used ? "Used" : "Not Used"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 10,
                marginTop: 16,
              }}
            >
              <StatBox label="Lap Time" value={formatLapTime(lap.lapTimeMs)} color="#22c55e" />
              <StatBox
                label="Delta to PB"
                value={formatDelta(deltas.toPersonalBestMs)}
                color={deltaColor(deltas.toPersonalBestMs)}
                subvalue={
                  personalBest
                    ? "PB: " + formatLapTime(personalBest.lapTimeMs) + " on lap " + (personalBest.lapNumber ?? "-")
                    : "No valid personal best found"
                }
              />
              <StatBox
                label="Validity"
                value={lap.valid ? "Valid" : "Invalid"}
                color={lap.valid ? "#22c55e" : "#f87171"}
              />
              <StatBox label="Track" value={session.trackName || "-"} subvalue={session.trackKey || ""} />
              <StatBox
                label="Cornering Speed"
                value={formatNumber(stats.cornering?.averageSpeedKph, 1, " km/h")}
                subvalue={
                  stats.cornering?.cornerCount
                    ? stats.cornering.cornerCount + " detected corner zones"
                    : "Estimated from steering samples"
                }
              />
              <StatBox
                label="Braking Distance"
                value={formatNumber(stats.braking?.longestDistanceM, 1, " m")}
                subvalue={
                  stats.braking?.zoneCount
                    ? stats.braking.zoneCount + " braking zones"
                    : "Estimated from brake trace"
                }
              />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Sectors</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 10,
                marginTop: 12,
              }}
            >
              <StatBox
                label="Sector 1"
                value={formatLapTime(lap.sector1Ms)}
                subvalue={"vs PB: " + formatDelta(sectorDeltas.sector1Ms)}
                color={deltaColor(sectorDeltas.sector1Ms)}
              />
              <StatBox
                label="Sector 2"
                value={formatLapTime(lap.sector2Ms)}
                subvalue={"vs PB: " + formatDelta(sectorDeltas.sector2Ms)}
                color={deltaColor(sectorDeltas.sector2Ms)}
              />
              <StatBox
                label="Sector 3"
                value={formatLapTime(lap.sector3Ms)}
                subvalue={"vs PB: " + formatDelta(sectorDeltas.sector3Ms)}
                color={deltaColor(sectorDeltas.sector3Ms)}
              />
            </div>
          </div>

          <ReplayControls
            traces={traces}
            replayTimeMs={replayTimeMs}
            replayDurationMs={replayDurationMs}
            replaySpeed={replaySpeed}
            isReplaying={isReplaying}
            activeSample={activeSample}
            onPlayPause={handleReplayPlayPause}
            onRestart={handleReplayRestart}
            onSeekBy={handleReplaySeekBy}
            onSeekTo={handleReplaySeekTo}
            onSpeedStep={handleReplaySpeedStep}
          />

          <PostLapTelemetryMap
            apiBase={API_BASE}
            trackKey={session.trackKey}
            traces={traces}
            activeIndex={activeSampleIndex}
            sectorBoundaries={sectorBoundaries}
          />

          {traces.length === 0 ? (
            <div className="card">
              <h2>Telemetry Graphs</h2>
              <p style={{ color: "#94a3b8" }}>
                No raw telemetry samples were saved for this lap, so only timing data is available.
              </p>
            </div>
          ) : (
            <CombinedTelemetryGraph
              labels={labels}
              traces={traces}
              visibleMetrics={visibleMetrics}
              onToggle={toggleMetric}
              activeIndex={activeSampleIndex}
              onHoverIndex={(index) => {
                if (!isReplaying) setHoveredSampleIndex(index);
              }}
              sectorBoundaries={sectorBoundaries}
              autoScroll={hoveredSampleIndex === null}
            />
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
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
import { trimFutureLapPointsOnReset } from "../utils/lapResetTrim";
import { getTrackKeyFromSession } from "../utils/sessionUtils";

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

function formatSectorDeltaSeconds(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + (Math.abs(value) / 1000).toFixed(3) + "s";
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
    <div className="analysis-stat-card">
      <div className="analysis-stat-label">{label}</div>
      <div className="analysis-stat-value" style={{ color: color || "white" }}>
        {value}
      </div>
      {subvalue && <div className="analysis-stat-subvalue">{subvalue}</div>}
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
  if (metricKey === "drsAvailable") return sample.drsAvailable ? 1 : 0;
  if (metricKey === "drs") return sample.drs ? 1 : 0;
  return null;
}

function graphValueLabel(metric, raw) {
  if (raw === null || raw === undefined) return "-";

  if (metric.key === "drs" || metric.key === "drsAvailable") {
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

  if (metric.key === "drs" || metric.key === "drsAvailable") {
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
const REPLAY_THUMB_WIDTH = 64;

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
  onPlayPause,
  onRestart,
  onSeekBy,
  onSeekTo,
  onSpeedStep,
  containerStyle,
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

  // Calculate progress bar position accounting for thumb offset
  const thumbHalfWidth = REPLAY_THUMB_WIDTH / 2;
  const progressBarLeft = `calc(${progress}% * (100% - ${REPLAY_THUMB_WIDTH}px) / 100% + ${thumbHalfWidth}px)`;

  return (
    <div className="card" style={{ marginBottom: 24, ...containerStyle }}>
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
        className="replay-range-slider"
        style={{
          width: "100%",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          minWidth: 0,
          height: 5,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
          marginTop: 16,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${thumbHalfWidth}px`,
            top: 0,
            width: `calc((100% - ${REPLAY_THUMB_WIDTH}px) * ${progress} / 100)`,
            height: "100%",
            background: "linear-gradient(90deg, #22c55e, #a855f7)",
            borderRadius: "999px 0 0 999px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: progressBarLeft,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            background: "white",
            border: "2px solid #a855f7",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function ReplayDriverPanel({ activeSample, containerStyle }) {
  return (
    <div className="card" style={{ marginBottom: 20, marginTop: 24, ...containerStyle }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
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
    if (!xScale || !chartArea || !chart.ctx) return;
    
    // Additional safety check for chart dimensions
    if (chartArea.bottom <= chartArea.top || chartArea.right <= chartArea.left) return;
    
    const ctx = chart.ctx;

    try {
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
    } catch (err) {
      console.warn("telemetryGuides plugin error:", err);
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
  metrics = GRAPH_METRICS,
  containerStyle,
}) {
  const scrollRef = useRef(null);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: metrics.filter((metric) => visibleMetrics[metric.key]).map((metric) => ({
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
    [labels, metrics, traces, visibleMetrics]
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
              const metric = metrics.find((item) => item.key === context.dataset.metricKey);
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
    [activeIndex, metrics, onHoverIndex, sectorBoundaries, traces]
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
    <div className="card" style={containerStyle}>
      <div className="analysis-panel-head">
        <h2>Telemetry Overlay</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {metrics.map((metric) => (
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

      <div ref={scrollRef} style={{ overflowX: "auto", minHeight: "260px" }} onMouseLeave={() => onHoverIndex(null)} className="telemetry-chart-scroll">
        <div style={{ minWidth: chartMinWidth, height: 260, minHeight: 260 }}>
          {traces.length > 0 && labels.length > 0 ? (
            <Line
              data={chartData}
              options={options}
              plugins={[telemetryGuidesPlugin]}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
              No data to display
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LapPerformanceAnalysis() {
  const { sessionId, lapId } = useParams();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analysisView, setAnalysisView] = useState("beginner");
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  const [hoveredSampleIndex, setHoveredSampleIndex] = useState(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayTimeMs, setReplayTimeMs] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);

  // Force visibility after component mounts (fixes blank screen on some browsers)
  useEffect(() => {
    console.log('LapPerformanceAnalysis mounted');
    const timer = setTimeout(() => {
      const shell = document.querySelector('.route-transition-shell');
      if (shell) {
        shell.classList.add('loaded');
        console.log('Added loaded class to route-transition-shell');
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Log when extras expand or view changes
  useEffect(() => {
    console.log('View changed:', analysisView, 'Extras expanded:', extrasExpanded);
  }, [analysisView, extrasExpanded]);

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

  const rawTraces = data?.traces || [];
  const traces = useMemo(
    () => trimFutureLapPointsOnReset(rawTraces),
    [rawTraces]
  );
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

  const beginnerMetrics = useMemo(() => {
    return GRAPH_METRICS.filter((metric) =>
      metric.key === "speed" || metric.key === "throttle" || metric.key === "brake"
    );
  }, []);

  const [beginnerVisibleMetrics, setBeginnerVisibleMetrics] = useState(() => {
    return { speed: true, throttle: true, brake: true };
  });

  function toggleMetric(metricKey) {
    setVisibleMetrics((current) => ({
      ...current,
      [metricKey]: current[metricKey] !== true,
    }));
  }

  function toggleBeginnerMetric(metricKey) {
    setBeginnerVisibleMetrics((current) => ({
      ...current,
      [metricKey]: current[metricKey] !== true,
    }));
  }

  const lap = data?.lap || {};
  const session = data?.session || {};
  const normalizedTrackKey = getTrackKeyFromSession(session);
  const flipSingapore = Boolean(
    normalizedTrackKey === "track_12" || /singapore/i.test(String(normalizedTrackKey || ""))
  );
  const rotateBahrain = Boolean(
    normalizedTrackKey === "track_3" || /sakhir|bahrain/i.test(String(normalizedTrackKey || ""))
  );
  const DEFAULT_TRACE_SCALE = 0.8;
  const [draftTraceScale, setDraftTraceScale] = useState(DEFAULT_TRACE_SCALE);
  const [appliedTraceScale, setAppliedTraceScale] = useState(DEFAULT_TRACE_SCALE);
  const DEFAULT_TRACE_H_SCALE = 1.0;
  const [draftTraceHScale, setDraftTraceHScale] = useState(DEFAULT_TRACE_H_SCALE);
  const [appliedTraceHScale, setAppliedTraceHScale] = useState(DEFAULT_TRACE_H_SCALE);
  const [traceScaleText, setTraceScaleText] = useState(String(Math.round(DEFAULT_TRACE_SCALE * 100)));
  const [traceHScaleText, setTraceHScaleText] = useState(String(Math.round(DEFAULT_TRACE_H_SCALE * 100)));
  const [traceScaleTextFocused, setTraceScaleTextFocused] = useState(false);
  const [traceHScaleTextFocused, setTraceHScaleTextFocused] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Sync text inputs with slider/reset changes (only when input is not focused)
  useEffect(() => {
    if (!traceScaleTextFocused) {
      setTraceScaleText(String(Math.round(draftTraceScale * 100)));
    }
  }, [draftTraceScale, traceScaleTextFocused]);

  useEffect(() => {
    if (!traceHScaleTextFocused) {
      setTraceHScaleText(String(Math.round(draftTraceHScale * 100)));
    }
  }, [draftTraceHScale, traceHScaleTextFocused]);

  function commitTraceScaleText() {
    const v = Number(traceScaleText);
    if (Number.isFinite(v) && v >= 50 && v <= 120) {
      setDraftTraceScale(v / 100);
    }
    setTraceScaleText(String(Math.round(draftTraceScale * 100)));
    setTraceScaleTextFocused(false);
  }

  function commitTraceHScaleText() {
    const v = Number(traceHScaleText);
    if (Number.isFinite(v) && v >= 50 && v <= 150) {
      setDraftTraceHScale(v / 100);
    }
    setTraceHScaleText(String(Math.round(draftTraceHScale * 100)));
    setTraceHScaleTextFocused(false);
  }

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
  const isBeginnerView = analysisView === "beginner";
  const replayDurationMs = replayTimeline[replayTimeline.length - 1] || 0;
  const replayIndex = replayIndexForTime(replayTimeline, replayTimeMs);
  const replayPosition = replayPositionForTime(replayTimeline, replayTimeMs);
  const activeSampleIndex = hoveredSampleIndex ?? replayPosition ?? replayIndex;
  const activeSample = interpolateReplaySample(traces, activeSampleIndex);
  const backToSession = new URLSearchParams(location.search).get("from") === "session";
  const backPath = backToSession
    ? `/session/${encodeURIComponent(sessionId)}`
    : "/leaderboard";
  const backLabel = backToSession ? "Back to Session" : "Back to Leaderboard";

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

  useEffect(() => {
    if (isBeginnerView) {
      setIsReplaying(false);
    }
  }, [isBeginnerView]);

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

  function renderTelemetryPanel({ metrics = GRAPH_METRICS, visible = visibleMetrics, onToggle }) {
    if (traces.length === 0) {
      return (
        <div className="card" style={{ height: "100%" }}>
          <h2>Telemetry Overview</h2>
          <p style={{ color: "#94a3b8" }}>
            No raw telemetry samples were saved for this lap, so only timing data is available.
          </p>
        </div>
      );
    }

    // Additional safety check - ensure we have at least some valid data
    const hasValidData = traces.some(sample => 
      sample && (
        Number.isFinite(sample.speedKph) ||
        Number.isFinite(sample.throttlePct) ||
        Number.isFinite(sample.brakePct) ||
        Number.isFinite(sample.rpm)
      )
    );

    if (!hasValidData) {
      return (
        <div className="card" style={{ height: "100%" }}>
          <h2>Telemetry Overview</h2>
          <p style={{ color: "#94a3b8" }}>
            Telemetry samples exist but contain no valid data points for charting.
          </p>
        </div>
      );
    }

    return (
      <CombinedTelemetryGraph
        labels={labels}
        traces={traces}
        metrics={metrics}
        visibleMetrics={visible}
        onToggle={onToggle}
        activeIndex={activeSampleIndex}
        onHoverIndex={(index) => {
          if (!isReplaying) setHoveredSampleIndex(index);
        }}
        sectorBoundaries={sectorBoundaries}
        autoScroll={hoveredSampleIndex === null}
        containerStyle={{ height: "100%" }}
      />
    );
  }

  return (
    <div className="page-container lap-performance-page">
      <div className="analysis-page-header">
        <div>
          <h1>
            Lap <span className="text-blue">Performance</span>
          </h1>
          <p className="analysis-muted">
            Post-race analysis for one saved lap.
          </p>
          <div
            className={`lap-view-switch ${isBeginnerView ? "is-beginner" : "is-advanced"}`}
            role="tablist"
            aria-label="Analysis view mode"
          >
            <button
              type="button"
              className={isBeginnerView ? "active" : ""}
              onClick={() => setAnalysisView("beginner")}
              aria-selected={isBeginnerView}
            >
              Beginner
            </button>
            <button
              type="button"
              className={!isBeginnerView ? "active" : ""}
              onClick={() => setAnalysisView("advanced")}
              aria-selected={!isBeginnerView}
            >
              Advanced
            </button>
          </div>
        </div>
        <Link
          to={backPath}
          className="analysis-back-link"
        >
          {backLabel}
        </Link>
      </div>

      {loading && <p>Loading lap analysis...</p>}
      {error && <p style={{ color: "#f87171" }}>Error: {error}</p>}

      {!loading && !error && data && (
        <>
          <div className="card analysis-summary-card">
            <div className="analysis-summary-head" style={{ marginBottom: 0 }}>
              <div>
                <h2>
                  {session.trackName || "Unknown Track"} | Lap {lap.lapNumber ?? "-"}
                </h2>
                <p className="analysis-muted">
                  {session.username || "Unknown Driver"} | {formatDateTime(lap.recordedAt || session.startedAt)}
                </p>
                <div style={{ color: "#a8b2c8", marginTop: 8, marginBottom: 0 }}>
                    <div style={{ marginBottom: 8 }}>
                      <button
                        type="button"
                        className="lap-extras-toggle"
                        onClick={() => setSettingsExpanded((s) => !s)}
                        aria-expanded={settingsExpanded}
                      >
                        <span>Map Settings</span>
                        <span className={`lap-extras-chevron ${settingsExpanded ? "open" : ""}`}>v</span>
                      </button>

                      {settingsExpanded && (
                        <div className="lap-extras-body" key="map-settings-expanded-beginner">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <label style={{ color: '#cbd5e1', fontSize: 13, minWidth: 160 }}>Trace vertical scale</label>
                              <input
                                type="range"
                                min="50"
                                max="120"
                                step="1"
                                value={Math.round(draftTraceScale * 100)}
                                onChange={(e) => setDraftTraceScale(Number(e.target.value) / 100)}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={traceScaleText}
                                onChange={(e) => setTraceScaleText(e.target.value)}
                                onFocus={() => setTraceScaleTextFocused(true)}
                                onBlur={commitTraceScaleText}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitTraceScaleText(); }}
                                className="map-settings-number-input"
                              />
                              <span style={{ color: '#cbd5e1', fontSize: 13 }}>%</span>
                              <button
                                type="button"
                                className="map-settings-btn"
                                onClick={() => setAppliedTraceScale(draftTraceScale)}
                                disabled={Number(appliedTraceScale) === Number(draftTraceScale)}
                              >
                                Apply
                              </button>
                              <button
                                type="button"
                                className="map-settings-btn"
                                onClick={() => { setDraftTraceScale(DEFAULT_TRACE_SCALE); setAppliedTraceScale(DEFAULT_TRACE_SCALE); }}
                                disabled={Number(appliedTraceScale) === Number(DEFAULT_TRACE_SCALE) && Number(draftTraceScale) === Number(DEFAULT_TRACE_SCALE)}
                              >
                                Reset
                              </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <label style={{ color: '#cbd5e1', fontSize: 13, minWidth: 160 }}>Trace horizontal scale</label>
                              <input
                                type="range"
                                min="50"
                                max="150"
                                step="1"
                                value={Math.round(draftTraceHScale * 100)}
                                onChange={(e) => setDraftTraceHScale(Number(e.target.value) / 100)}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={traceHScaleText}
                                onChange={(e) => setTraceHScaleText(e.target.value)}
                                onFocus={() => setTraceHScaleTextFocused(true)}
                                onBlur={commitTraceHScaleText}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitTraceHScaleText(); }}
                                className="map-settings-number-input"
                              />
                              <span style={{ color: '#cbd5e1', fontSize: 13 }}>%</span>
                              <button
                                type="button"
                                className="map-settings-btn"
                                onClick={() => setAppliedTraceHScale(draftTraceHScale)}
                                disabled={Number(appliedTraceHScale) === Number(draftTraceHScale)}
                              >
                                Apply
                              </button>
                              <button
                                type="button"
                                className="map-settings-btn"
                                onClick={() => { setDraftTraceHScale(DEFAULT_TRACE_H_SCALE); setAppliedTraceHScale(DEFAULT_TRACE_H_SCALE); }}
                                disabled={Number(appliedTraceHScale) === Number(DEFAULT_TRACE_H_SCALE) && Number(draftTraceHScale) === Number(DEFAULT_TRACE_H_SCALE)}
                              >
                                Reset
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
              </div>
            </div>
          </div>

          {isBeginnerView && (
            <div className="lap-analysis-two-col-grid" key="beginner-mode">
              <div className="lap-analysis-column lap-analysis-column-left">
                <div className="lap-analysis-grid-item map-panel">
                  <PostLapTelemetryMap
                    apiBase={API_BASE}
                    trackKey={session.trackKey}
                    traces={traces}
                    activeIndex={activeSampleIndex}
                    sectorBoundaries={sectorBoundaries}
                    containerStyle={{ height: "100%", minHeight: "300px" }}
                    flipMap={flipSingapore}
                    rotateDeg={rotateBahrain ? 90 : 0}
                    traceScale={appliedTraceScale}
                    traceHScale={appliedTraceHScale}
                  />
                </div>

                <div className="lap-analysis-grid-item replay-panel">
                  <ReplayControls
                    traces={traces}
                    replayTimeMs={replayTimeMs}
                    replayDurationMs={replayDurationMs}
                    replaySpeed={replaySpeed}
                    isReplaying={isReplaying}
                    onPlayPause={handleReplayPlayPause}
                    onRestart={handleReplayRestart}
                    onSeekBy={handleReplaySeekBy}
                    onSeekTo={handleReplaySeekTo}
                    onSpeedStep={handleReplaySpeedStep}
                    containerStyle={{ height: "100%", minHeight: "200px" }}
                  />
                </div>
              </div>

              <div className="lap-analysis-column lap-analysis-column-right">
                <div className="lap-analysis-grid-item telemetry-panel">
                  {renderTelemetryPanel({
                    metrics: beginnerMetrics,
                    visible: beginnerVisibleMetrics,
                    onToggle: toggleBeginnerMetric,
                  })}
                </div>

                <div className="lap-analysis-grid-item driver-panel">
                  <ReplayDriverPanel activeSample={activeSample} containerStyle={{ height: "100%", minHeight: "180px" }} />
                </div>
              </div>
            </div>
          )}

          {!isBeginnerView && (
            <div className="lap-analysis-two-col-grid" key="advanced-mode">
              <div className="lap-analysis-column lap-analysis-column-left">
                <div className="lap-analysis-grid-item map-panel">
                  <PostLapTelemetryMap
                    apiBase={API_BASE}
                    trackKey={session.trackKey}
                    traces={traces}
                    activeIndex={activeSampleIndex}
                    sectorBoundaries={sectorBoundaries}
                    containerStyle={{ height: "100%", minHeight: "300px" }}
                    flipMap={flipSingapore}
                    rotateDeg={rotateBahrain ? 90 : 0}
                    traceScale={appliedTraceScale}
                    traceHScale={appliedTraceHScale}
                  />
                </div>

                <div className="lap-analysis-grid-item replay-panel">
                  <ReplayControls
                    traces={traces}
                    replayTimeMs={replayTimeMs}
                    replayDurationMs={replayDurationMs}
                    replaySpeed={replaySpeed}
                    isReplaying={isReplaying}
                    onPlayPause={handleReplayPlayPause}
                    onRestart={handleReplayRestart}
                    onSeekBy={handleReplaySeekBy}
                    onSeekTo={handleReplaySeekTo}
                    onSpeedStep={handleReplaySpeedStep}
                    containerStyle={{ height: "100%", minHeight: "200px" }}
                  />
                </div>
              </div>

              <div className="lap-analysis-column lap-analysis-column-right">
                <div className="lap-analysis-grid-item telemetry-panel">
                  {renderTelemetryPanel({
                    metrics: GRAPH_METRICS,
                    visible: visibleMetrics,
                    onToggle: toggleMetric,
                  })}
                </div>

                <div className="lap-analysis-grid-item driver-panel">
                  <ReplayDriverPanel activeSample={activeSample} containerStyle={{ height: "100%", minHeight: "180px" }} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}



import { useEffect, useMemo, useState } from "react";
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

function CombinedTelemetryGraph({ labels, traces, visibleMetrics, onToggle }) {
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
      },
    }),
    [traces]
  );

  const chartMinWidth = Math.max(1080, labels.length * 5);

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

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: chartMinWidth, height: 430 }}>
          <Line data={chartData} options={options} />
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
            />
          )}
        </>
      )}
    </div>
  );
}

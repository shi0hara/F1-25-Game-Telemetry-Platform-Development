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

function MetricChart({ title, unit, color, labels, values, yMax, stepped = false }) {
  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: title + (unit ? " (" + unit + ")" : ""),
          data: values,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 0,
          tension: stepped ? 0 : 0.25,
          stepped,
          spanGaps: true,
        },
      ],
    }),
    [color, labels, stepped, title, unit, values]
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
          suggestedMax: yMax,
          ticks: {
            color: "#cbd5e1",
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const raw = context.raw;
              if (raw === null || raw === undefined) return title + ": -";
              const value = Number(raw);
              return title + ": " + (Number.isFinite(value) ? value.toFixed(1) : raw) + (unit ? " " + unit : "");
            },
          },
        },
      },
    }),
    [title, unit, yMax]
  );

  return (
    <div className="card">
      <h2 style={{ marginBottom: 10 }}>{title}</h2>
      <div style={{ height: 240 }}>
        <Line data={chartData} options={options} />
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

  const speedValues = useMemo(() => traces.map((sample) => sample.speedKph ?? null), [traces]);
  const throttleValues = useMemo(() => traces.map((sample) => sample.throttlePct ?? null), [traces]);
  const brakeValues = useMemo(() => traces.map((sample) => sample.brakePct ?? null), [traces]);
  const rpmValues = useMemo(() => traces.map((sample) => sample.rpm ?? null), [traces]);
  const gearValues = useMemo(() => traces.map((sample) => sample.gear ?? null), [traces]);

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

          {traces.length === 0 ? (
            <div className="card">
              <h2>Telemetry Graphs</h2>
              <p style={{ color: "#94a3b8" }}>
                No raw telemetry samples were saved for this lap, so only timing data is available.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              <MetricChart title="Speed" unit="km/h" color="#38bdf8" labels={labels} values={speedValues} yMax={360} />
              <MetricChart title="Throttle" unit="%" color="#22c55e" labels={labels} values={throttleValues} yMax={100} />
              <MetricChart title="Brake" unit="%" color="#f87171" labels={labels} values={brakeValues} yMax={100} />
              <MetricChart title="RPM" unit="rpm" color="#facc15" labels={labels} values={rpmValues} yMax={13000} />
              <MetricChart title="Gear" unit="" color="#a78bfa" labels={labels} values={gearValues} yMax={8} stepped />
            </div>
          )}
        </>
      )}
    </div>
  );
}

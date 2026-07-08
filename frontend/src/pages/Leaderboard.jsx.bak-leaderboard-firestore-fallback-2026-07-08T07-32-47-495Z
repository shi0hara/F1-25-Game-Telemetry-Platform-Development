import { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function formatLapTime(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return "-";
  const value = Number(ms);
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const fraction = value % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
    .toString()
    .padStart(3, "0")}`;
}

function formatGap(ms) {
  if (!Number.isFinite(Number(ms))) return "-";
  const value = Number(ms);
  if (value <= 0) return "-";
  return `+${(value / 1000).toFixed(3)}`;
}

function formatSector(ms) {
  return Number.isFinite(Number(ms)) && Number(ms) > 0
    ? formatLapTime(Number(ms))
    : "-";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function shortSessionId(value) {
  return value ? String(value).slice(0, 8) : "-";
}

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API_BASE}/leaderboard?limit=50`);
        const contentType = res.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
          ? await res.json()
          : null;

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load leaderboard.");
        }

        if (cancelled) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setMeta(data.meta || null);
      } catch (err) {
        if (cancelled) return;
        console.error("Leaderboard load error:", err);
        setError(err.message || "Failed to load leaderboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const leader = useMemo(() => rows[0] || null, [rows]);

  return (
    <div className="page-container">
      <h1>
        Global <span className="text-primary">Leaderboards</span>
      </h1>

      <div className="card" style={{ marginBottom: "20px" }}>
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
            <h2>Fastest Valid Laps</h2>
            <p style={{ marginTop: 4, color: "#aaa" }}>
              One placement per driver, using their best real valid lap.
            </p>
          </div>

          {meta && (
            <div style={{ color: "#aaa", fontSize: 13, textAlign: "right" }}>
              {meta.userCount ?? rows.length} drivers | {meta.validLaps ?? 0} valid laps
            </div>
          )}
        </div>

        {loading && <p>Loading leaderboard...</p>}
        {error && <p style={{ color: "var(--color-accent-red, #f87171)" }}>{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p>No valid lap times found yet.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: "10px" }}>
            <table
              style={{
                width: "100%",
                textAlign: "left",
                borderCollapse: "collapse",
                minWidth: 860,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-bg-light-grey)" }}>
                  <th style={{ padding: "10px" }}>Rank</th>
                  <th>Driver</th>
                  <th>Track</th>
                  <th>Lap</th>
                  <th>Lap Time</th>
                  <th>Gap</th>
                  <th>S1</th>
                  <th>S2</th>
                  <th>S3</th>
                  <th>Session</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isLeader = leader?.sessionId === row.sessionId && leader?.lapId === row.lapId;

                  return (
                    <tr
                      key={`${row.userId || row.username}-${row.sessionId}-${row.lapId}`}
                      style={{ borderBottom: "1px solid var(--color-bg-light-grey)" }}
                    >
                      <td
                        style={{
                          padding: "10px",
                          color: row.rank === 1 ? "var(--color-accent-yellow)" : "inherit",
                          fontWeight: row.rank <= 3 ? "bold" : "normal",
                        }}
                      >
                        #{row.rank}
                      </td>
                      <td style={{ fontWeight: "bold" }}>{row.username || "Unknown Driver"}</td>
                      <td>{row.trackName || row.trackKey || "-"}</td>
                      <td>Lap {row.lapNumber ?? "-"}</td>
                      <td style={{ color: "var(--color-accent-green)", fontWeight: "bold" }}>
                        {row.lapTime || formatLapTime(row.lapTimeMs)}
                      </td>
                      <td>{isLeader ? "-" : formatGap(row.gapToLeaderMs)}</td>
                      <td>{formatSector(row.sector1Ms)}</td>
                      <td>{formatSector(row.sector2Ms)}</td>
                      <td>{formatSector(row.sector3Ms)}</td>
                      <td title={row.sessionId}>
                        {shortSessionId(row.sessionId)} | {formatDate(row.sessionStartedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

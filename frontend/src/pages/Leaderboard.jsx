import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

const FALLBACK_SESSION_LIMIT = 120;
const MIN_VALID_LAP_MS = 10000;
const MAX_VALID_LAP_MS = 600000;
const SECTOR_BEST_PURPLE = "#a855f7";

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

function leaderboardRowKey(row) {
  return [
    row.userKey || row.userId || row.username || "driver",
    row.sessionId || "session",
    row.lapId || row.lapNumber || "lap",
  ].join("|");
}

function findBestSectorCells(rows) {
  const best = {
    sector1Ms: null,
    sector2Ms: null,
    sector3Ms: null,
  };

  for (const row of rows) {
    for (const sectorKey of Object.keys(best)) {
      const value = Number(row[sectorKey]);
      if (!Number.isFinite(value) || value <= 0) continue;

      if (!best[sectorKey] || value < best[sectorKey].value) {
        best[sectorKey] = {
          value,
          cellKey: leaderboardRowKey(row) + "|" + sectorKey,
        };
      }
    }
  }

  return {
    sector1Ms: best.sector1Ms?.cellKey || null,
    sector2Ms: best.sector2Ms?.cellKey || null,
    sector3Ms: best.sector3Ms?.cellKey || null,
  };
}

function isBestSectorCell(row, sectorKey, bestSectorCells) {
  return bestSectorCells[sectorKey] === leaderboardRowKey(row) + "|" + sectorKey;
}

function bestSectorStyle(row, sectorKey, bestSectorCells) {
  if (!isBestSectorCell(row, sectorKey, bestSectorCells)) return undefined;

  return {
    color: SECTOR_BEST_PURPLE,
    fontWeight: 800,
    textShadow: "0 0 10px rgba(168, 85, 247, 0.5)",
  };
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value._seconds === "number") return value._seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString();
}

function shortSessionId(value) {
  return value ? String(value).slice(0, 8) : "-";
}

function lapAnalysisPath(row) {
  if (!row?.sessionId || !row?.lapId) return "";
  return (
    "/analysis/" +
    encodeURIComponent(row.sessionId) +
    "/lap/" +
    encodeURIComponent(row.lapId)
  );
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function trackKeyFrom(trackId, trackName) {
  if (trackId !== null && trackId !== undefined && trackId !== "") {
    return `track_${Number(trackId)}`;
  }

  return `track_${normalizeKey(trackName || "unknown_track") || "unknown_track"}`;
}

function isValidLap(lap) {
  const lapTimeMs = Number(lap?.lapTimeMs);
  return (
    lap?.valid === true &&
    Number.isFinite(lapTimeMs) &&
    lapTimeMs >= MIN_VALID_LAP_MS &&
    lapTimeMs <= MAX_VALID_LAP_MS
  );
}

function buildFallbackEntry(session, lap) {
  const lapTimeMs = Number(lap.lapTimeMs);
  const trackId = lap.trackId ?? session.trackId ?? null;
  const trackName = lap.trackName || session.trackName || "Unknown Track";
  const trackKey = session.trackKey || trackKeyFrom(trackId, trackName);
  const userKey =
    session.userId ||
    normalizeKey(session.username) ||
    normalizeKey(session.email) ||
    session.id;

  return {
    userKey,
    userId: session.userId || null,
    username: session.username || "Unknown Driver",
    sessionId: session.id,
    lapId: lap.id,
    lapNumber: lap.lapNumber ?? null,
    lapTimeMs,
    lapTime: formatLapTime(lapTimeMs),
    sector1Ms: lap.sector1Ms ?? null,
    sector2Ms: lap.sector2Ms ?? null,
    sector3Ms: lap.sector3Ms ?? null,
    valid: true,
    trackName,
    trackId,
    trackKey,
    sessionStartedAt: session.startedAt || null,
    recordedAt: lap.recordedAt || null,
    sortRecordedAtMs: toMillis(lap.recordedAt),
    sortStartedAtMs: toMillis(session.startedAt),
  };
}

function rankEntries(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (a.lapTimeMs !== b.lapTimeMs) return a.lapTimeMs - b.lapTimeMs;
    return b.sortRecordedAtMs - a.sortRecordedAtMs;
  });

  const leaderTime = sorted[0]?.lapTimeMs ?? null;

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    gapToLeaderMs: leaderTime !== null ? entry.lapTimeMs - leaderTime : null,
  }));
}

function buildTrackScopedPayload(entries, selectedTrackKey = null) {
  const trackStats = new Map();
  const bestByTrackAndUser = new Map();

  for (const entry of entries) {
    if (!entry.trackKey) continue;

    if (!trackStats.has(entry.trackKey)) {
      trackStats.set(entry.trackKey, {
        trackKey: entry.trackKey,
        trackName: entry.trackName || entry.trackKey,
        trackId: entry.trackId ?? null,
        validLaps: 0,
        userKeys: new Set(),
        bestLapTimeMs: null,
        latestActivityMs: 0,
      });
    }

    const stats = trackStats.get(entry.trackKey);
    stats.validLaps += 1;
    stats.userKeys.add(entry.userKey);
    stats.latestActivityMs = Math.max(
      stats.latestActivityMs,
      entry.sortRecordedAtMs || entry.sortStartedAtMs || 0
    );
    if (stats.bestLapTimeMs === null || entry.lapTimeMs < stats.bestLapTimeMs) {
      stats.bestLapTimeMs = entry.lapTimeMs;
    }

    if (!bestByTrackAndUser.has(entry.trackKey)) {
      bestByTrackAndUser.set(entry.trackKey, new Map());
    }

    const bestByUser = bestByTrackAndUser.get(entry.trackKey);
    const existing = bestByUser.get(entry.userKey);
    if (
      !existing ||
      entry.lapTimeMs < existing.lapTimeMs ||
      (entry.lapTimeMs === existing.lapTimeMs &&
        entry.sortRecordedAtMs > existing.sortRecordedAtMs)
    ) {
      bestByUser.set(entry.userKey, entry);
    }
  }

  const tracks = [...trackStats.values()]
    .map((track) => ({
      trackKey: track.trackKey,
      trackName: track.trackName,
      trackId: track.trackId,
      validLaps: track.validLaps,
      userCount: track.userKeys.size,
      bestLapTimeMs: track.bestLapTimeMs,
      bestLapTime: formatLapTime(track.bestLapTimeMs),
      latestActivityMs: track.latestActivityMs,
    }))
    .sort((a, b) => {
      if (b.latestActivityMs !== a.latestActivityMs) return b.latestActivityMs - a.latestActivityMs;
      return String(a.trackName || "").localeCompare(String(b.trackName || ""));
    });

  const activeTrack =
    tracks.find((track) => track.trackKey === selectedTrackKey) ||
    tracks[0] ||
    null;
  const activeTrackKey = activeTrack?.trackKey || null;
  const activeBestByUser = activeTrackKey
    ? bestByTrackAndUser.get(activeTrackKey) || new Map()
    : new Map();
  const rows = rankEntries([...activeBestByUser.values()]).slice(0, 50);

  return {
    rows,
    tracks,
    activeTrack,
    activeTrackKey,
    meta: {
      source: "firestore_fallback",
      leaderboardType: "best_valid_actual_lap_per_user_per_track",
      trackScoped: true,
      trackCount: tracks.length,
      validLaps: activeTrack?.validLaps ?? 0,
      userCount: activeBestByUser.size,
    },
  };
}

async function loadLeaderboardFromFirestore(selectedTrackKey = null) {
  const sessionsQuery = query(
    collection(db, "sessions"),
    orderBy("startedAt", "desc"),
    limit(FALLBACK_SESSION_LIMIT)
  );
  const sessionsSnap = await getDocs(sessionsQuery);
  const entries = [];
  let scannedLaps = 0;

  for (const sessionDoc of sessionsSnap.docs) {
    const session = { id: sessionDoc.id, ...sessionDoc.data() };
    const lapsSnap = await getDocs(collection(db, "sessions", sessionDoc.id, "laps"));

    lapsSnap.forEach((lapDoc) => {
      scannedLaps += 1;
      const lap = { id: lapDoc.id, ...lapDoc.data() };
      if (!isValidLap(lap)) return;
      entries.push(buildFallbackEntry(session, lap));
    });
  }

  const payload = buildTrackScopedPayload(entries, selectedTrackKey);
  return {
    ...payload,
    meta: {
      ...payload.meta,
      scannedSessions: sessionsSnap.size,
      scannedLaps,
    },
  };
}

function isTrackScopedPayload(data) {
  return (
    data?.meta?.trackScoped === true &&
    data?.meta?.leaderboardType === "best_valid_actual_lap_per_user_per_track" &&
    Array.isArray(data.tracks)
  );
}

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [selectedTrackKey, setSelectedTrackKey] = useState("");
  const [activeTrack, setActiveTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [meta, setMeta] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setLoading(true);
        setError("");
        setNotice("");

        let payload = null;

        try {
          const url = selectedTrackKey
            ? `${API_BASE}/leaderboard?limit=50&trackKey=${encodeURIComponent(selectedTrackKey)}`
            : `${API_BASE}/leaderboard?limit=50`;
          const res = await fetch(url);
          const contentType = res.headers.get("content-type") || "";
          const data = contentType.includes("application/json")
            ? await res.json()
            : null;

          if (!res.ok) {
            throw new Error(
              data?.error || `Backend leaderboard failed: HTTP ${res.status}`
            );
          }

          if (!isTrackScopedPayload(data)) {
            throw new Error("Backend leaderboard is not track-scoped yet.");
          }

          payload = data;
        } catch (backendErr) {
          console.warn("Backend leaderboard failed, using Firestore fallback:", backendErr);
          payload = await loadLeaderboardFromFirestore(selectedTrackKey);
          setNotice("");
        }

        if (cancelled) return;
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setTracks(Array.isArray(payload.tracks) ? payload.tracks : []);
        setActiveTrack(payload.activeTrack || null);
        setMeta(payload.meta || null);

        if (!selectedTrackKey && payload.activeTrackKey) {
          setSelectedTrackKey(payload.activeTrackKey);
        }
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
  }, [selectedTrackKey]);

  const leader = useMemo(() => rows[0] || null, [rows]);
  const bestSectorCells = useMemo(() => findBestSectorCells(rows), [rows]);

  return (
    <div className="page-container">
      <h1>
        Track <span className="text-primary">Leaderboards</span>
      </h1>

      <div className="card card-tight">
        <div className="split-head">
          <div>
            <h2>{activeTrack?.trackName || "Fastest Valid Laps"}</h2>
            <p className="muted-copy">
              Rankings are separated by track. One placement per driver, using their best real valid lap.
            </p>
          </div>

          {meta && (
            <div className="meta-copy">
              {meta.userCount ?? rows.length} drivers | {meta.validLaps ?? 0} valid laps
            </div>
          )}
        </div>

        {tracks.length > 0 && (
          <div className="chip-row">
            {tracks.map((track) => {
              const selected = track.trackKey === (activeTrack?.trackKey || selectedTrackKey);
              return (
                <button
                  key={track.trackKey}
                  type="button"
                  onClick={() => setSelectedTrackKey(track.trackKey)}
                  className={selected ? "chip-btn active" : "chip-btn"}
                >
                  {track.trackName || track.trackKey} ({track.userCount})
                </button>
              );
            })}
          </div>
        )}

        {loading && <p>Loading leaderboard...</p>}
        {notice && !error && <p className="notice-message">{notice}</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="empty-state">No valid lap times found for this track yet.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="table-wrap">
            <table className="f1-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Driver</th>
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
                  const lapPath = lapAnalysisPath(row);
                  const isLeader = leader?.sessionId === row.sessionId && leader?.lapId === row.lapId;

                  return (
                    <tr
                      key={`${row.userKey || row.userId || row.username}-${row.sessionId}-${row.lapId}`}
                      onClick={() => {
                        if (lapPath) navigate(lapPath);
                      }}
                      onKeyDown={(event) => {
                        if (!lapPath) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(lapPath);
                        }
                      }}
                      role={lapPath ? "button" : undefined}
                      tabIndex={lapPath ? 0 : undefined}
                      title={lapPath ? "Open lap performance analysis" : undefined}
                      className={lapPath ? "clickable-row" : ""}
                    >
                      <td
                        className={
                          row.rank === 1
                            ? "rank-cell top-rank"
                            : row.rank <= 3
                              ? "rank-cell podium"
                              : "rank-cell"
                        }
                      >
                        #{row.rank}
                      </td>
                      <td><strong>{row.username || "Unknown Driver"}</strong></td>
                      <td>
                        {row.sessionId && row.lapId ? (
                          <Link
                            to={lapPath}
                            onClick={(event) => event.stopPropagation()}
                            className="lap-link"
                          >
                            Lap {row.lapNumber ?? "-"}
                          </Link>
                        ) : (
                          <>Lap {row.lapNumber ?? "-"}</>
                        )}
                      </td>
                      <td className="lap-time">
                        {row.lapTime || formatLapTime(row.lapTimeMs)}
                      </td>
                      <td>{isLeader ? "-" : formatGap(row.gapToLeaderMs)}</td>
                      <td style={bestSectorStyle(row, "sector1Ms", bestSectorCells)}>
                        {formatSector(row.sector1Ms)}
                      </td>
                      <td style={bestSectorStyle(row, "sector2Ms", bestSectorCells)}>
                        {formatSector(row.sector2Ms)}
                      </td>
                      <td style={bestSectorStyle(row, "sector3Ms", bestSectorCells)}>
                        {formatSector(row.sector3Ms)}
                      </td>
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

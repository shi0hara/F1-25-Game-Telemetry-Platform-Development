import { useEffect, useMemo, useRef, useState } from "react";
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

const FALLBACK_SESSION_LIMIT = 180;
const MIN_VALID_LAP_MS = 10000;
const MAX_VALID_LAP_MS = 600000;
const SECTOR_BEST_PURPLE = "#a855f7";
const LEADERBOARD_SCOPES = [
  { key: "all", label: "All Time", shortLabel: "All" },
  { key: "weekly", label: "Weekly", shortLabel: "Week" },
  { key: "daily", label: "Daily", shortLabel: "Day" },
];

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

function scopeOption(scopeKey) {
  return (
    LEADERBOARD_SCOPES.find((scope) => scope.key === scopeKey) ||
    LEADERBOARD_SCOPES[0]
  );
}

function scopeStartMs(scopeKey) {
  const now = Date.now();
  if (scopeKey === "daily") return now - 24 * 60 * 60 * 1000;
  if (scopeKey === "weekly") return now - 7 * 24 * 60 * 60 * 1000;
  return null;
}

function leaderboardActivityMs(entry) {
  return (
    Number(entry?.sortRecordedAtMs) ||
    Number(entry?.recordedAtMs) ||
    toMillis(entry?.recordedAt) ||
    Number(entry?.sortStartedAtMs) ||
    toMillis(entry?.sessionStartedAt) ||
    0
  );
}

function isEntryInScope(entry, scopeKey) {
  const startMs = scopeStartMs(scopeKey);
  if (!startMs) return true;
  return leaderboardActivityMs(entry) >= startMs;
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

// Map of known F1 track IDs to canonical names (mirrors revamp.py TRACK_ID_TO_NAME)
const TRACK_ID_TO_NAME = {
  0: "Melbourne",
  2: "Shanghai",
  3: "Sakhir (Bahrain)",
  4: "Catalunya",
  5: "Monaco",
  6: "Montreal",
  7: "Silverstone",
  9: "Hungaroring",
  10: "Spa",
  11: "Monza",
  12: "Singapore",
  13: "Suzuka",
  14: "Abu Dhabi",
  15: "Texas",
  16: "Brazil",
  17: "Austria",
  19: "Mexico",
  20: "Baku (Azerbaijan)",
  26: "Zandvoort",
  27: "Imola",
  29: "Jeddah",
  30: "Miami",
  31: "Las Vegas",
  32: "Losail",
  39: "Silverstone (Reverse)",
  40: "Austria (Reverse)",
  41: "Zandvoort (Reverse)",
};

function resolveTrackName(trackId, trackName) {
  if (trackName && trackName !== "Unknown Track") return trackName;
  if (trackId !== null && trackId !== undefined && trackId !== "") {
    return TRACK_ID_TO_NAME[Number(trackId)] || trackName || "Unknown Track";
  }
  return trackName || "Unknown Track";
}

function trackKeyFrom(trackId, trackName) {
  // Prefer trackName as the canonical key to avoid duplicates when some
  // sessions have a numeric trackId and others only have the name string.
  const resolved = resolveTrackName(trackId, trackName);
  const normalized = normalizeKey(resolved);
  if (normalized && normalized !== "unknown_track") {
    return `track_${normalized}`;
  }

  if (trackId !== null && trackId !== undefined && trackId !== "") {
    return `track_${Number(trackId)}`;
  }

  return "track_unknown_track";
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
  const trackName = resolveTrackName(trackId, lap.trackName || session.trackName || null);
  // Always recompute trackKey from trackName to avoid duplicates caused by
  // stale or inconsistent trackKey values stored in Firestore documents.
  const trackKey = trackKeyFrom(trackId, trackName);
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
    return leaderboardActivityMs(b) - leaderboardActivityMs(a);
  });

  const leaderTime = sorted[0]?.lapTimeMs ?? null;

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    gapToLeaderMs: leaderTime !== null ? entry.lapTimeMs - leaderTime : null,
  }));
}

function buildTrackScopedPayload(entries, selectedTrackKey = null, timeScope = "all") {
  const trackStats = new Map();
  const bestByTrackAndUser = new Map();

  for (const entry of entries) {
    if (!isEntryInScope(entry, timeScope)) continue;
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

  // Collect best lap per user for ALL tracks so client-side switching works
  const allRows = [];
  for (const [, bestByUser] of bestByTrackAndUser) {
    for (const entry of bestByUser.values()) {
      allRows.push(entry);
    }
  }

  return {
    rows: allRows,
    tracks,
    activeTrack,
    activeTrackKey,
    meta: {
      source: "firestore_fallback",
      timeScope,
      timeScopeLabel: scopeOption(timeScope).label,
      leaderboardType: "best_valid_actual_lap_per_user_per_track",
      trackScoped: true,
      trackCount: tracks.length,
      validLaps: tracks.reduce((sum, t) => sum + t.validLaps, 0),
      userCount: new Set(allRows.map((r) => r.userKey)).size,
    },
  };
}

async function loadLeaderboardFromFirestore(selectedTrackKey = null, timeScope = "all") {
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

  const payload = buildTrackScopedPayload(entries, selectedTrackKey, timeScope);
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

/**
 * Merges tracks that resolve to the same canonical key (by trackName).
 * This handles the case where the backend or Firestore data has the same track
 * stored under different keys (e.g. "track_13" vs "track_suzuka").
 */
function normalizePayloadTrackKeys(payload, selectedTrackKey) {
  const tracks = payload.tracks || [];
  const rows = payload.rows || [];

  // Build a mapping from original trackKey to canonical trackKey
  const keyMap = new Map();
  const mergedTracks = new Map();

  for (const track of tracks) {
    const canonicalKey = trackKeyFrom(track.trackId, track.trackName);
    keyMap.set(track.trackKey, canonicalKey);

    if (mergedTracks.has(canonicalKey)) {
      const existing = mergedTracks.get(canonicalKey);
      existing.validLaps += track.validLaps || 0;
      existing.userCount += track.userCount || 0;
      existing.latestActivityMs = Math.max(
        existing.latestActivityMs || 0,
        track.latestActivityMs || 0
      );
      if (
        track.bestLapTimeMs &&
        (!existing.bestLapTimeMs || track.bestLapTimeMs < existing.bestLapTimeMs)
      ) {
        existing.bestLapTimeMs = track.bestLapTimeMs;
        existing.bestLapTime = formatLapTime(track.bestLapTimeMs);
      }
    } else {
      mergedTracks.set(canonicalKey, {
        ...track,
        trackKey: canonicalKey,
      });
    }
  }

  const normalizedTracks = [...mergedTracks.values()];

  // Determine the active track key after normalization
  const resolvedSelectedKey = selectedTrackKey
    ? keyMap.get(selectedTrackKey) || selectedTrackKey
    : null;
  const activeTrack =
    normalizedTracks.find((t) => t.trackKey === resolvedSelectedKey) ||
    normalizedTracks.find((t) => t.trackKey === (keyMap.get(payload.activeTrackKey) || payload.activeTrackKey)) ||
    normalizedTracks[0] ||
    null;
  const activeTrackKey = activeTrack?.trackKey || null;

  // Re-key rows
  const normalizedRows = rows.map((row) => ({
    ...row,
    trackKey: keyMap.get(row.trackKey) || trackKeyFrom(row.trackId, row.trackName),
  }));

  return {
    ...payload,
    tracks: normalizedTracks,
    rows: normalizedRows,
    activeTrack,
    activeTrackKey,
  };
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
  const [timeScope, setTimeScope] = useState("all");
  const navigate = useNavigate();

  // Store all entries so track switching can happen client-side without re-fetching
  const [allEntries, setAllEntries] = useState([]);
  const [allTracks, setAllTracks] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setLoading(true);
        setError("");
        setNotice("");

        let payload = null;

        try {
          const params = new URLSearchParams({
            limit: "50",
            scanLimit: "500",
            scope: timeScope,
          });
          const url = `${API_BASE}/leaderboard?${params.toString()}`;
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

          const backendScope = data.meta?.timeScope || data.filters?.scope || "all";
          if (backendScope !== timeScope) {
            throw new Error("Backend leaderboard does not support this time period yet.");
          }

          // Backend must return rows for all tracks for client-side switching.
          // If it only returns rows for one track, fall through to Firestore.
          const trackKeysInRows = new Set(
            (data.rows || []).map((r) => r.trackKey)
          );
          if (
            Array.isArray(data.tracks) &&
            data.tracks.length > 1 &&
            trackKeysInRows.size <= 1
          ) {
            throw new Error("Backend only returned rows for one track.");
          }

          payload = data;
        } catch (backendErr) {
          console.warn("Backend leaderboard failed, using Firestore fallback:", backendErr);
          payload = await loadLeaderboardFromFirestore(null, timeScope);
          setNotice("");
        }

        if (cancelled) return;

        // Normalize track keys in the payload to merge duplicates
        if (Array.isArray(payload.tracks) && payload.tracks.length > 0) {
          payload = normalizePayloadTrackKeys(payload, null);
        }

        setAllTracks(Array.isArray(payload.tracks) ? payload.tracks : []);
        setAllEntries(Array.isArray(payload.rows) ? payload.rows : []);
        setMeta(payload.meta || null);

        setSelectedTrackKey((previousTrackKey) => {
          if (
            previousTrackKey &&
            payload.tracks?.some((track) => track.trackKey === previousTrackKey)
          ) {
            return previousTrackKey;
          }

          return payload.activeTrackKey || payload.tracks?.[0]?.trackKey || "";
        });
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
  }, [timeScope]);

  // Client-side track switching: re-derive rows whenever selectedTrackKey changes
  useEffect(() => {
    if (allTracks.length === 0) return;

    const active =
      allTracks.find((t) => t.trackKey === selectedTrackKey) ||
      allTracks[0] ||
      null;
    setActiveTrack(active);
    setTracks(allTracks);

    if (!active) {
      setRows([]);
      return;
    }

    // If allEntries already contains all tracks' rows (from Firestore fallback
    // which builds the full dataset), filter and rank for the active track.
    // For the initial load where rows were already filtered to one track,
    // we need to re-fetch from Firestore if the track doesn't match.
    const trackRows = allEntries.filter((r) => r.trackKey === active.trackKey);
    if (trackRows.length > 0 || active.trackKey === selectedTrackKey) {
      setRows(rankEntries(trackRows).slice(0, 50));
    } else {
      setRows([]);
    }
  }, [selectedTrackKey, allTracks, allEntries]);

  const leader = useMemo(() => rows[0] || null, [rows]);
  const bestSectorCells = useMemo(() => findBestSectorCells(rows), [rows]);
  const activeScope = scopeOption(timeScope);
  const activeDriverCount = activeTrack?.userCount ?? rows.length;
  const activeValidLapCount = activeTrack?.validLaps ?? meta?.validLaps ?? 0;

  // Custom searchable dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [trackSearch, setTrackSearch] = useState("");
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedLabel = useMemo(() => {
    const track = tracks.find(
      (t) => t.trackKey === (activeTrack?.trackKey || selectedTrackKey)
    );
    if (!track) return "";
    return `${track.trackName || track.trackKey} (${track.userCount})`;
  }, [tracks, activeTrack, selectedTrackKey]);

  const filteredTracks = useMemo(() => {
    if (!trackSearch.trim()) return tracks;
    const query = trackSearch.toLowerCase();
    return tracks.filter((t) =>
      (t.trackName || t.trackKey).toLowerCase().includes(query)
    );
  }, [tracks, trackSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
        setTrackSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [dropdownOpen]);

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
              Rankings are separated by track and time period. One placement per driver, using their best real valid lap.
            </p>
          </div>

          {meta && (
            <div className="meta-copy">
              {activeScope.label} | {activeDriverCount} drivers | {activeValidLapCount} valid laps
            </div>
          )}
        </div>

        <div className="leaderboard-controls">
          <div className="scope-toggle" aria-label="Leaderboard time period">
            {LEADERBOARD_SCOPES.map((scope) => (
              <button
                key={scope.key}
                type="button"
                className={
                  timeScope === scope.key
                    ? "scope-toggle-btn active"
                    : "scope-toggle-btn"
                }
                onClick={() => setTimeScope(scope.key)}
              >
                {scope.label}
              </button>
            ))}
          </div>

        {tracks.length > 0 && (
          <div className="track-select-row" ref={dropdownRef}>
            <button
              type="button"
              className="track-dropdown-trigger"
              onClick={() => { setDropdownOpen((prev) => !prev); setTrackSearch(""); }}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              <span>{selectedLabel || "Select Track"}</span>
              <svg className="track-dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="track-dropdown-menu" role="listbox">
                <div className="track-dropdown-search-wrap">
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="track-dropdown-search"
                    placeholder="Search tracks..."
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDropdownOpen(false);
                        setTrackSearch("");
                      }
                    }}
                  />
                </div>
                <ul className="track-dropdown-list">
                  {filteredTracks.length === 0 && (
                    <li className="track-dropdown-empty">No tracks found</li>
                  )}
                  {filteredTracks.map((track) => {
                    const isActive = track.trackKey === (activeTrack?.trackKey || selectedTrackKey);
                    return (
                      <li
                        key={track.trackKey}
                        role="option"
                        aria-selected={isActive}
                        className={isActive ? "track-dropdown-item active" : "track-dropdown-item"}
                        onClick={() => {
                          setSelectedTrackKey(track.trackKey);
                          setDropdownOpen(false);
                          setTrackSearch("");
                        }}
                      >
                        {track.trackName || track.trackKey} ({track.userCount})
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        </div>

        {loading && <p>Loading leaderboard...</p>}
        {notice && !error && <p className="notice-message">{notice}</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="empty-state">No valid lap times found for this track yet.</p>
        )}

        {!loading && !error && leader && (
          <div className="leader-banner">
            <div>
              <span className="leader-banner-kicker">
                {activeScope.label} #{leader.rank || 1} on {activeTrack?.trackName || leader.trackName || "this track"}
              </span>
              <h2>{leader.username || "Unknown Driver"}</h2>
              <p>
                {leader.lapTime || formatLapTime(leader.lapTimeMs)} | Lap {leader.lapNumber ?? "-"} | {formatDate(leader.sessionStartedAt)}
              </p>
            </div>
            {lapAnalysisPath(leader) && (
              <button
                type="button"
                className="leader-banner-action"
                onClick={() => navigate(lapAnalysisPath(leader))}
              >
                View lap
              </button>
            )}
          </div>
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


import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getSessionEndedAt,
  getSessionStartedAt,
  isActiveSession,
  sortSessionsForDisplay,
  toMillis,
} from "../utils/sessionUtils";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getLocalTimezoneOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

function formatLapTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const fraction = value % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
    .toString()
    .padStart(3, "0")}`;
}

function formatDateTime(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString();
}

function formatSessionEnded(session) {
  if (isActiveSession(session)) return "Still active";
  return formatDateTime(getSessionEndedAt(session));
}

function sessionBestLapMs(session) {
  const summary = session?.processedSummary || {};
  return (
    summary.bestLapTimeMs ??
    summary.fastestLap?.lapTimeMs ??
    summary.fastestLap?.rawMs ??
    summary.bestLap?.lapTimeMs ??
    null
  );
}

function sessionLink(session) {
  if (!session?.id) return "/live";
  return isActiveSession(session)
    ? `/live?session=${encodeURIComponent(session.id)}`
    : `/session/${encodeURIComponent(session.id)}`;
}

function lapAnalysisPath(row) {
  if (!row?.sessionId || !row?.lapId) return "/leaderboard";
  return (
    "/analysis/" +
    encodeURIComponent(row.sessionId) +
    "/lap/" +
    encodeURIComponent(row.lapId)
  );
}

function sortLeaderboardRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const aTime = Number(a.lapTimeMs);
    const bTime = Number(b.lapTimeMs);
    if (aTime !== bTime) return aTime - bTime;
    return Number(b.sortRecordedAtMs || b.activityMs || 0) - Number(a.sortRecordedAtMs || a.activityMs || 0);
  });
}

function trackOptionKey(track) {
  return (
    track?.trackKey ||
    String(track?.trackName || "unknown_track")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
  );
}

function trackNameKey(track) {
  return String(track?.trackName || track?.trackKey || "")
    .trim()
    .toLowerCase();
}

function trackLabel(track) {
  return track?.trackName || track?.trackKey || "Unknown Track";
}

function mergeDailyTrackOptions(allPayload, dailyPayload) {
  const dailyTracks = Array.isArray(dailyPayload?.tracks) ? dailyPayload.tracks : [];
  const allTracks = Array.isArray(allPayload?.tracks) && allPayload.tracks.length
    ? allPayload.tracks
    : dailyTracks;
  const dailyByKey = new Map(dailyTracks.map((track) => [trackOptionKey(track), track]));
  const dailyByName = new Map(dailyTracks.map((track) => [trackNameKey(track), track]));
  const seen = new Set();

  const options = allTracks.map((track) => {
    const key = trackOptionKey(track);
    const dailyTrack = dailyByKey.get(key) || dailyByName.get(trackNameKey(track)) || null;
    seen.add(key);
    if (dailyTrack) seen.add(trackOptionKey(dailyTrack));

    return {
      ...track,
      trackKey: key,
      dailyTrackKey: dailyTrack ? trackOptionKey(dailyTrack) : null,
      dailyValidLaps: Number(dailyTrack?.validLaps || 0),
      dailyUserCount: Number(dailyTrack?.userCount || 0),
      dailyBestLapTimeMs: dailyTrack?.bestLapTimeMs ?? null,
      dailyBestLapTime: dailyTrack?.bestLapTime ?? "-",
    };
  });

  for (const dailyTrack of dailyTracks) {
    const key = trackOptionKey(dailyTrack);
    if (seen.has(key)) continue;
    options.push({
      ...dailyTrack,
      trackKey: key,
      dailyTrackKey: key,
      dailyValidLaps: Number(dailyTrack.validLaps || 0),
      dailyUserCount: Number(dailyTrack.userCount || 0),
      dailyBestLapTimeMs: dailyTrack.bestLapTimeMs ?? null,
      dailyBestLapTime: dailyTrack.bestLapTime ?? "-",
    });
  }

  return options.sort((a, b) => {
    const aHasDaily = Number(a.dailyValidLaps || 0) > 0 ? 1 : 0;
    const bHasDaily = Number(b.dailyValidLaps || 0) > 0 ? 1 : 0;
    if (bHasDaily !== aHasDaily) return bHasDaily - aHasDaily;
    return trackLabel(a).localeCompare(trackLabel(b));
  });
}

function pickDailyLeader(payload, selectedTrackKey = "") {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
  const activeTrack =
    tracks.find((track) => trackOptionKey(track) === selectedTrackKey) ||
    (!selectedTrackKey ? payload?.activeTrack : null) ||
    tracks.find((track) => Number(track.validLaps || 0) > 0) ||
    tracks[0] ||
    null;
  const activeTrackKey =
    selectedTrackKey || trackOptionKey(activeTrack) || payload?.activeTrackKey || null;
  const scopedRows = activeTrackKey
    ? rows.filter((row) => trackOptionKey(row) === activeTrackKey)
    : rows;
  const leader =
    sortLeaderboardRows(scopedRows)[0] ||
    (!selectedTrackKey ? sortLeaderboardRows(rows)[0] : null) ||
    null;
  const leaderTrack =
    activeTrack ||
    tracks.find((track) => trackOptionKey(track) === trackOptionKey(leader)) ||
    null;

  return { leader, track: leaderTrack };
}

function pickDailyTrackKey(current, allPayload, dailyPayload) {
  const options = mergeDailyTrackOptions(allPayload || dailyPayload, dailyPayload);
  if (current && options.some((track) => track.trackKey === current)) {
    return current;
  }

  const activeDailyKey = dailyPayload?.activeTrackKey || trackOptionKey(dailyPayload?.activeTrack);
  const activeOption = options.find(
    (track) => track.dailyTrackKey === activeDailyKey || track.trackKey === activeDailyKey
  );

  return (
    activeOption?.trackKey ||
    options.find((track) => Number(track.dailyValidLaps || 0) > 0)?.trackKey ||
    options[0]?.trackKey ||
    ""
  );
}

async function fetchLeaderboard(scope, signal) {
  const params = new URLSearchParams({
    limit: "100",
    scope,
    scanLimit: "500",
    tzOffsetMinutes: String(getLocalTimezoneOffsetMinutes()),
  });
  const res = await fetch(`${API_BASE}/leaderboard?${params.toString()}`, {
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Failed to load ${scope} leaderboard.`);
  }
  return data;
}

async function fetchDailyLeaderboard(signal) {
  return fetchLeaderboard("daily", signal);
}

async function fetchAllTimeLeaderboard(signal) {
  return fetchLeaderboard("all", signal);
}

async function fetchPersonalSessions(signal) {
  const headers = getAuthHeaders();
  if (!headers.Authorization) return [];

  const res = await fetch(`${API_BASE}/sessions`, {
    headers,
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load your sessions.");
  }
  return Array.isArray(data) ? data : [];
}

export default function Dashboard({ currentUser }) {
  const [sessions, setSessions] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [allLeaderboard, setAllLeaderboard] = useState(null);
  const [selectedDailyTrackKey, setSelectedDailyTrackKey] = useState("");
  const [leaderDropdownOpen, setLeaderDropdownOpen] = useState(false);
  const [leaderTrackSearch, setLeaderTrackSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const leaderDropdownRef = useRef(null);
  const leaderSearchInputRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const [sessionList, dailyPayload] = await Promise.all([
          currentUser ? fetchPersonalSessions(controller.signal) : Promise.resolve([]),
          fetchDailyLeaderboard(controller.signal),
        ]);

        if (cancelled) return;
        setSessions(sessionList);
        setLeaderboard(dailyPayload);
        setAllLeaderboard(dailyPayload);
        setSelectedDailyTrackKey((current) =>
          pickDailyTrackKey(current, dailyPayload, dailyPayload)
        );

        fetchAllTimeLeaderboard(controller.signal)
          .then((allPayload) => {
            if (cancelled) return;
            setAllLeaderboard(allPayload || dailyPayload);
            setSelectedDailyTrackKey((current) =>
              pickDailyTrackKey(current, allPayload || dailyPayload, dailyPayload)
            );
          })
          .catch((err) => {
            if (!cancelled && err?.name !== "AbortError") {
              console.warn("All-time leaderboard unavailable for dashboard track list:", err);
            }
          });
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        console.error("Dashboard load error:", err);
        setError(err.message || "Failed to load dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentUser]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (leaderDropdownRef.current && !leaderDropdownRef.current.contains(event.target)) {
        setLeaderDropdownOpen(false);
        setLeaderTrackSearch("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (leaderDropdownOpen && leaderSearchInputRef.current) {
      leaderSearchInputRef.current.focus();
    }
  }, [leaderDropdownOpen]);

  const displaySessions = useMemo(() => sortSessionsForDisplay(sessions), [sessions]);
  const latestSession = displaySessions[0] || null;
  const dailyTrackOptions = useMemo(
    () => mergeDailyTrackOptions(allLeaderboard, leaderboard),
    [allLeaderboard, leaderboard]
  );
  const selectedDailyTrack = useMemo(
    () =>
      dailyTrackOptions.find((track) => track.trackKey === selectedDailyTrackKey) ||
      dailyTrackOptions[0] ||
      null,
    [dailyTrackOptions, selectedDailyTrackKey]
  );
  const dailySelectionKey = selectedDailyTrack?.dailyTrackKey || selectedDailyTrackKey;
  const daily = useMemo(
    () => pickDailyLeader(leaderboard, dailySelectionKey),
    [leaderboard, dailySelectionKey]
  );
  const filteredDailyTracks = useMemo(() => {
    if (!leaderTrackSearch.trim()) return dailyTrackOptions;
    const search = leaderTrackSearch.trim().toLowerCase();
    return dailyTrackOptions.filter((track) =>
      trackLabel(track).toLowerCase().includes(search)
    );
  }, [dailyTrackOptions, leaderTrackSearch]);
  const dailyLeader = daily.leader;
  const dailyTrack = selectedDailyTrack || daily.track;
  const selectedDailyTrackLabel = dailyTrack
    ? `${trackLabel(dailyTrack)} (${dailyTrack.dailyUserCount ?? dailyTrack.userCount ?? 0})`
    : "";

  return (
    <div className="page-container dashboard-page">
      <p className="page-kicker">Telemetry Control</p>
      <h1>
        Race <span className="text-yellow">Dashboard</span>
      </h1>

      {error && <p className="error-message">{error}</p>}

      <div className="card dashboard-overview-card">
        <div>
          <h2>Platform Overview</h2>
          <p className="muted-copy">
            F1 telemetry sessions are recorded by the local listener, saved to Firebase, ranked by valid lap times, and prepared for post-session coaching.
          </p>
        </div>

        <div className="dashboard-overview-grid">
          <div>
            <span>Recording</span>
            <strong>Live telemetry</strong>
            <p>Speed, throttle, brake, steering, RPM, gear, DRS, assists, lap trails, and sector data.</p>
          </div>
          <div>
            <span>Leaderboard</span>
            <strong>Valid laps only</strong>
            <p>Daily, weekly, and all-time rankings use one best legitimate lap per driver per track.</p>
          </div>
          <div>
            <span>Analysis</span>
            <strong>Post-race review</strong>
            <p>Session and lap pages expose maps, graphs, sector splits, and coaching-ready summaries.</p>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-accent-blue dashboard-focus-card">
          <div className="split-head">
            <div>
              <h2>{latestSession ? "Latest Session" : "Session Status"}</h2>
              <p className="muted-copy">
                {currentUser
                  ? "Your newest recorded session is ready here."
                  : "Log in to show your personal race sessions."}
              </p>
            </div>
            {latestSession && (
              <span className={isActiveSession(latestSession) ? "dashboard-pill live" : "dashboard-pill"}>
                {isActiveSession(latestSession) ? "Live" : "Ended"}
              </span>
            )}
          </div>

          {loading && currentUser ? (
            <p className="muted-copy">Loading your latest session...</p>
          ) : latestSession ? (
            <>
              <div className="dashboard-primary-metric">
                <span>{latestSession.trackName || "Unknown Track"}</span>
                <strong>{formatLapTime(sessionBestLapMs(latestSession))}</strong>
              </div>

              <div className="dashboard-detail-grid">
                <div>
                  <span>Started</span>
                  <strong>{formatDateTime(getSessionStartedAt(latestSession))}</strong>
                </div>
                <div>
                  <span>Ended</span>
                  <strong>{formatSessionEnded(latestSession)}</strong>
                </div>
                <div>
                  <span>Total Laps</span>
                  <strong>{latestSession.processedSummary?.totalLaps ?? 0}</strong>
                </div>
                <div>
                  <span>Top Speed</span>
                  <strong>{latestSession.processedSummary?.topSpeedKph ?? 0} km/h</strong>
                </div>
              </div>

              <Link className="dashboard-link-button" to={sessionLink(latestSession)}>
                {isActiveSession(latestSession) ? "Open Live Telemetry" : "Review Session"}
              </Link>
            </>
          ) : (
            <>
              <p className="empty-state">
                {currentUser
                  ? "No sessions found yet. Start the listener, pair the website, then drive a lap."
                  : "Sign in and pair the local listener to start recording race sessions."}
              </p>
              <Link className="dashboard-link-button" to={currentUser ? "/live" : "/login"}>
                {currentUser ? "Open Live Telemetry" : "Log In"}
              </Link>
            </>
          )}
        </div>

        <div className="card dashboard-leader-card">
          <div className="split-head">
            <div>
              <h2>Daily Race Leader</h2>
              <p className="muted-copy">
                Track-specific best valid lap from the daily leaderboard.
              </p>
            </div>
            <span className="dashboard-pill purple">Daily</span>
          </div>

          {dailyTrackOptions.length > 0 && (
            <div className="track-select-row dashboard-track-select" ref={leaderDropdownRef}>
              <button
                type="button"
                className="track-dropdown-trigger"
                onClick={() => {
                  setLeaderDropdownOpen((prev) => !prev);
                  setLeaderTrackSearch("");
                }}
                aria-haspopup="listbox"
                aria-expanded={leaderDropdownOpen}
              >
                <span>{selectedDailyTrackLabel || "Select Track"}</span>
                <svg className="track-dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {leaderDropdownOpen && (
                <div className="track-dropdown-menu" role="listbox">
                  <div className="track-dropdown-search-wrap">
                    <input
                      ref={leaderSearchInputRef}
                      type="text"
                      className="track-dropdown-search"
                      placeholder="Search tracks..."
                      value={leaderTrackSearch}
                      onChange={(event) => setLeaderTrackSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setLeaderDropdownOpen(false);
                          setLeaderTrackSearch("");
                        }
                      }}
                    />
                  </div>
                  <ul className="track-dropdown-list">
                    {filteredDailyTracks.length === 0 && (
                      <li className="track-dropdown-empty">No tracks found</li>
                    )}
                    {filteredDailyTracks.map((track) => {
                      const isActive = track.trackKey === selectedDailyTrack?.trackKey;
                      const driverCount = Number(track.dailyUserCount ?? track.userCount ?? 0);
                      const lapCount = Number(track.dailyValidLaps ?? track.validLaps ?? 0);

                      return (
                        <li
                          key={track.trackKey}
                          role="option"
                          aria-selected={isActive}
                          className={isActive ? "track-dropdown-item active" : "track-dropdown-item"}
                          onClick={() => {
                            setSelectedDailyTrackKey(track.trackKey);
                            setLeaderDropdownOpen(false);
                            setLeaderTrackSearch("");
                          }}
                        >
                          <span>{trackLabel(track)} ({driverCount})</span>
                          <span className="dashboard-track-count">{lapCount} today</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {loading && !dailyLeader ? (
            <p className="muted-copy">Loading today&apos;s leader...</p>
          ) : dailyLeader ? (
            <>
              <div className="dashboard-leader-name">
                {dailyLeader.username || "Unknown Driver"}
              </div>
              <div className="dashboard-leader-time">
                {dailyLeader.lapTime || formatLapTime(dailyLeader.lapTimeMs)}
              </div>
              <div className="dashboard-leader-meta">
                {dailyTrack?.trackName || dailyLeader.trackName || "Selected Track"} | Lap{" "}
                {dailyLeader.lapNumber ?? "-"} |{" "}
                {formatDate(dailyLeader.recordedAt || dailyLeader.sessionStartedAt)}
              </div>

              <div className="dashboard-actions">
                <Link className="dashboard-link-button secondary" to={lapAnalysisPath(dailyLeader)}>
                  View Lap
                </Link>
                <Link className="dashboard-link-button secondary" to="/leaderboard">
                  Full Leaderboard
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="empty-state">
                No valid daily laps yet for {dailyTrack ? trackLabel(dailyTrack) : "this track"}.
                Once someone records a valid lap today, the leader appears here.
              </p>
              <Link className="dashboard-link-button" to="/leaderboard">
                Open Leaderboard
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

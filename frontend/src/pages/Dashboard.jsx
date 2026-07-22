import { useEffect, useMemo, useState } from "react";
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

function pickDailyLeader(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
  const activeTrack =
    payload?.activeTrack ||
    tracks.find((track) => Number(track.validLaps || 0) > 0) ||
    tracks[0] ||
    null;
  const activeTrackKey = activeTrack?.trackKey || payload?.activeTrackKey || null;
  const scopedRows = activeTrackKey
    ? rows.filter((row) => row.trackKey === activeTrackKey)
    : rows;
  const leader = sortLeaderboardRows(scopedRows.length ? scopedRows : rows)[0] || null;
  const leaderTrack =
    activeTrack ||
    tracks.find((track) => track.trackKey === leader?.trackKey) ||
    null;

  return { leader, track: leaderTrack };
}

async function fetchDailyLeaderboard(signal) {
  const params = new URLSearchParams({
    limit: "100",
    scope: "daily",
    scanLimit: "500",
    tzOffsetMinutes: String(getLocalTimezoneOffsetMinutes()),
  });
  const res = await fetch(`${API_BASE}/leaderboard?${params.toString()}`, {
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load daily leaderboard.");
  }
  return data;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const displaySessions = useMemo(() => sortSessionsForDisplay(sessions), [sessions]);
  const latestSession = displaySessions[0] || null;
  const activeSessionCount = useMemo(
    () => sessions.filter((session) => isActiveSession(session)).length,
    [sessions]
  );
  const daily = useMemo(() => pickDailyLeader(leaderboard), [leaderboard]);
  const dailyLeader = daily.leader;
  const dailyTrack = daily.track;
  const dailyMeta = leaderboard?.meta || {};

  return (
    <div className="page-container dashboard-page">
      <p className="page-kicker">Telemetry Control</p>
      <h1>
        Race <span className="text-yellow">Dashboard</span>
      </h1>

      {error && <p className="error-message">{error}</p>}

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
                  <strong>{formatDateTime(getSessionEndedAt(latestSession))}</strong>
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
                No valid daily laps yet. Once someone records a valid lap today, the leader appears here.
              </p>
              <Link className="dashboard-link-button" to="/leaderboard">
                Open Leaderboard
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="dashboard-stat-row">
        <div>
          <span>Active Sessions</span>
          <strong>{currentUser ? activeSessionCount : "-"}</strong>
        </div>
        <div>
          <span>Your Sessions</span>
          <strong>{currentUser ? sessions.length : "-"}</strong>
        </div>
        <div>
          <span>Daily Valid Laps</span>
          <strong>{dailyMeta.validLaps ?? 0}</strong>
        </div>
        <div>
          <span>Daily Tracks</span>
          <strong>{dailyMeta.trackCount ?? leaderboard?.tracks?.length ?? 0}</strong>
        </div>
      </div>

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
    </div>
  );
}

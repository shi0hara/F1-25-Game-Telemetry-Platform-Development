import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useActiveSession from "../hooks/useActiveSession";
import {
  formatSessionFlag,
  getSessionEndedAt,
  getSessionStartedAt,
  getTrackKeyFromSession,
  isActiveSession,
  latestSessionId,
  sortSessionsForDisplay,
} from "../utils/sessionUtils";

function formatDate(value) {
  if (!value) return "-";

  const d =
    typeof value === "string"
      ? new Date(value)
      : value?.toDate?.() || new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString();
}

function formatLapTime(ms) {
  if (ms == null) return "-";

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const fraction = Math.trunc(ms % 1000);

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
    .toString()
    .padStart(3, "0")}`;
}

export default function LiveTelemetry({ currentUser }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedSessionId = searchParams.get("session");
  const isAdmin =
    currentUser?.isAdmin === true || currentUser?.role === "admin";
  const [sessionScope, setSessionScope] = useState("mine");
  const showAllSessions = isAdmin && sessionScope === "all";

  const {
    sessionId: autoSessionId,
    sessions,
    userData,
    loading,
    error,
  } = useActiveSession(showAllSessions ? "" : currentUser, {
    includeAllSessions: showAllSessions,
    sessionLimit: showAllSessions ? 250 : 50,
  });

  const displaySessions = useMemo(() => sortSessionsForDisplay(sessions), [sessions]);
  const latestId = useMemo(() => latestSessionId(sessions), [sessions]);
  const highlightedSessionId = requestedSessionId || autoSessionId;

  function switchSessionScope(nextScope) {
    if (nextScope === "all" && !isAdmin) return;
    setSessionScope(nextScope);
  }

  return (
    <div className="page-container">
      <h1>
        Telemetry <span className="text-blue">Sessions</span>
      </h1>

      <p style={{ color: "#94a3b8", marginTop: -6 }}>
        Select a session to open its live telemetry while it is active, or its post-session review after it ends.
      </p>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => switchSessionScope("mine")}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border:
              sessionScope === "mine"
                ? "1px solid var(--color-accent-green)"
                : "1px solid rgba(255,255,255,0.18)",
            background:
              sessionScope === "mine"
                ? "rgba(34,197,94,0.16)"
                : "rgba(255,255,255,0.05)",
            color: "white",
            cursor: "pointer",
          }}
        >
          My sessions
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => switchSessionScope("all")}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border:
                sessionScope === "all"
                  ? "1px solid var(--color-accent-yellow)"
                  : "1px solid rgba(255,255,255,0.18)",
              background:
                sessionScope === "all"
                  ? "rgba(250,204,21,0.14)"
                  : "rgba(255,255,255,0.05)",
              color: "white",
              cursor: "pointer",
            }}
          >
            All sessions
          </button>
        )}
      </div>

      {sessionScope === "all" && isAdmin ? (
        <p style={{ color: "#aaa" }}>
          Admin view: showing sessions across all users.
        </p>
      ) : (
        <p>
          Viewing your sessions:{" "}
          <strong>{userData?.username || currentUser?.username || "-"}</strong>
          {userData?.email ? ` (${userData.email})` : ""}
        </p>
      )}

      {loading && <p>Loading sessions...</p>}
      {error && <p style={{ color: "#f87171" }}>Error: {error}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Sessions</h2>

        {displaySessions.length === 0 && !loading ? (
          <p>No sessions found.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {displaySessions.map((session) => {
              const isHighlighted = highlightedSessionId === session.id;
              const summary = session.processedSummary || {};
              const active = isActiveSession(session);
              const latest = session.id === latestId;
              const trackKey = getTrackKeyFromSession(session);

              return (
                <button
                  key={session.id}
                  onClick={() => {
                    navigate(`/session/${encodeURIComponent(session.id)}`);
                  }}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    border: isHighlighted
                      ? "2px solid var(--color-accent-blue)"
                      : active
                        ? "1px solid rgba(34,197,94,0.75)"
                        : "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    background: active
                      ? "linear-gradient(90deg, rgba(34,197,94,0.16), rgba(255,255,255,0.04))"
                      : isHighlighted
                        ? "rgba(59,130,246,0.16)"
                        : "rgba(255,255,255,0.04)",
                    boxShadow: latest
                      ? "inset 3px 0 0 var(--color-accent-yellow)"
                      : "none",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{session.trackName || "Unknown Track"}</strong>
                    <span
                      style={{
                        padding: "2px 7px",
                        borderRadius: 999,
                        border: active
                          ? "1px solid rgba(34,197,94,0.65)"
                          : "1px solid rgba(255,255,255,0.16)",
                        background: active
                          ? "rgba(34,197,94,0.12)"
                          : "rgba(255,255,255,0.04)",
                        color: active ? "#bbf7d0" : "#cbd5e1",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {active ? "Active" : "Ended"}
                    </span>
                    {latest && (
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 999,
                          border: "1px solid rgba(250,204,21,0.65)",
                          background: "rgba(250,204,21,0.12)",
                          color: "#fef3c7",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        Latest
                      </span>
                    )}
                  </div>

                  {showAllSessions && (
                    <div>Driver: {session.username || session.userName || "-"}</div>
                  )}
                  <div>Session ID: {session.id}</div>
                  <div>Track Key: {trackKey || "-"}</div>
                  <div>Session Type: {session.sessionType ?? "-"}</div>
                  <div>Custom Setup: {formatSessionFlag(session.customSetup)}</div>
                  <div>Equal Performance: {formatSessionFlag(session.equalPerformance)}</div>
                  <div>Started: {formatDate(getSessionStartedAt(session))}</div>
                  <div>Ended: {formatDate(getSessionEndedAt(session))}</div>
                  <div>Best Lap: {formatLapTime(summary.bestLapTimeMs)}</div>
                  <div>Top Speed: {summary.topSpeedKph ?? 0} km/h</div>
                  <div>Total Laps: {summary.totalLaps ?? 0}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

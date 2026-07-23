import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  limit,
  getDocs,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import ListenerTokenPanel from "../components/ListenerTokenPanel";
import "../components/ListenerTokenPanel.css";
import "./Profile.css";
import {
  formatSessionFlag,
  getSessionEndedAt,
  getSessionStartedAt,
  isActiveSession,
  latestSessionId,
  sortSessionsForDisplay,
  toMillis,
} from "../utils/sessionUtils";
import { normalizeUsernameKey } from "../utils/userIdentity";

const PROFILE_STORAGE_PREFIX = "f1ProfilePrefs:";
const MIN_VALID_LAP_MS = 10000;
const MAX_VALID_LAP_MS = 600000;
const CAREER_LAP_DETAIL_LIMIT = 25;
const CAREER_LAP_FETCH_BATCH_SIZE = 4;

const TEAM_THEMES = {
  ferrari: {
    label: "Scuderia Ferrari",
    primary: "#E10600",
    secondary: "#111111",
    accent: "#FFD966",
  },
  mercedes: {
    label: "Mercedes-AMG Petronas",
    primary: "#00D2BE",
    secondary: "#0A0E12",
    accent: "#B8FFFA",
  },
  redbull: {
    label: "Oracle Red Bull Racing",
    primary: "#1E41FF",
    secondary: "#0C1230",
    accent: "#F1C545",
  },
  mclaren: {
    label: "McLaren",
    primary: "#FF8000",
    secondary: "#1A1A1A",
    accent: "#A7D8FF",
  },
  astonmartin: {
    label: "Aston Martin Aramco",
    primary: "#006F62",
    secondary: "#0C1715",
    accent: "#95EEDC",
  },
  alpine: {
    label: "BWT Alpine",
    primary: "#0090FF",
    secondary: "#130F30",
    accent: "#FF87D1",
  },
  williams: {
    label: "Williams Racing",
    primary: "#005AFF",
    secondary: "#12151E",
    accent: "#6FD1FF",
  },
  haas: {
    label: "MoneyGram Haas",
    primary: "#E8E8E8",
    secondary: "#1A1A1A",
    accent: "#D0122D",
  },
  racingbulls: {
    label: "Visa Cash App Racing Bulls",
    primary: "#1434CB",
    secondary: "#0A0E1A",
    accent: "#FFFFFF",
  },
  kicksauber: {
    label: "Kick Sauber",
    primary: "#00E701",
    secondary: "#0F1210",
    accent: "#FFFFFF",
  },
};

function getProfileStorageKey(username) {
  return `${PROFILE_STORAGE_PREFIX}${String(username || "").trim().toLowerCase()}`;
}

function getDefaultTheme() {
  return TEAM_THEMES.ferrari;
}

function loadLocalProfile(username) {
  if (!username) return null;

  try {
    const raw = localStorage.getItem(getProfileStorageKey(username));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  const d = new Date(ms);
  return d.toLocaleString();
}

function formatLapTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const fraction = Math.trunc(value % 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
    .toString()
    .padStart(3, "0")}`;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveNumberOrNull(value) {
  const n = numberOrNull(value);
  return n !== null && n > 0 ? n : null;
}

function startOfCurrentWeekMs() {
  const start = new Date();
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysSinceMonday);
  return start.getTime();
}

function normalizedTrackKey(session, lap = {}) {
  const trackKey = lap.trackKey || session.trackKey;
  if (trackKey) return String(trackKey);
  const trackId = lap.trackId ?? session.trackId;
  if (trackId !== undefined && trackId !== null && trackId !== "") {
    return `track_${trackId}`;
  }

  return String(lap.trackName || session.trackName || "unknown_track")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sessionTotalLaps(session, laps) {
  const summary = session.processedSummary || {};
  const summaryTotal =
    numberOrNull(summary.totalLaps) ??
    numberOrNull(summary.lapCount) ??
    numberOrNull(session.totalLaps) ??
    numberOrNull(session.lapCount);
  const lapDocTotal = Array.isArray(laps) ? laps.length : 0;

  return Math.max(summaryTotal ?? 0, lapDocTotal);
}

function isValidLapForStats(lap) {
  const lapTimeMs = Number(lap?.lapTimeMs);
  return (
    lap?.valid === true &&
    Number.isFinite(lapTimeMs) &&
    lapTimeMs >= MIN_VALID_LAP_MS &&
    lapTimeMs <= MAX_VALID_LAP_MS
  );
}

function summaryBestLapTimeMs(summary) {
  return positiveNumberOrNull(
    summary?.bestLapTimeMs ??
      summary?.fastestLap?.lapTimeMs ??
      summary?.fastestLap?.rawMs ??
      summary?.bestLap?.lapTimeMs
  );
}

function hasUsefulCareerSummary(session) {
  const summary = session?.processedSummary || {};
  return (
    numberOrNull(summary.totalLaps) !== null ||
    numberOrNull(summary.lapCount) !== null ||
    numberOrNull(summary.validLapCount) !== null ||
    numberOrNull(summary.validLaps) !== null ||
    summaryBestLapTimeMs(summary) !== null
  );
}

function shouldFetchCareerLaps(session, weekStartMs) {
  if (isActiveSession(session)) return true;

  const activityMs = Math.max(
    toMillis(getSessionStartedAt(session)),
    toMillis(getSessionEndedAt(session)),
    toMillis(session?.latestTelemetryAt),
    toMillis(session?.updatedAt)
  );

  return activityMs >= weekStartMs || !hasUsefulCareerSummary(session);
}

function lapActivityMs(lap, session) {
  return Math.max(
    toMillis(lap?.recordedAt),
    toMillis(lap?.completedAt),
    toMillis(lap?.createdAt),
    toMillis(getSessionEndedAt(session)),
    toMillis(session?.latestTelemetryAt),
    toMillis(session?.updatedAt),
    toMillis(getSessionStartedAt(session))
  );
}

function buildValidLapEntries(sessions, sessionLaps) {
  const entries = [];

  for (const session of sessions) {
    const laps = sessionLaps[session.id];
    const summary = session.processedSummary || {};

    if (Array.isArray(laps) && laps.length > 0) {
      laps.forEach((lap) => {
        if (!isValidLapForStats(lap)) return;
        entries.push({ lap, session });
      });
      continue;
    }

    const fallbackBestLapMs = summaryBestLapTimeMs(summary);

    if (fallbackBestLapMs) {
      entries.push({
        lap: {
          valid: true,
          lapTimeMs: fallbackBestLapMs,
          lapNumber: summary.fastestLap?.lapNumber ?? summary.bestLap?.lapNumber ?? null,
          recordedAt: getSessionEndedAt(session) || getSessionStartedAt(session),
        },
        session,
      });
    }
  }

  return entries;
}

function calculateCoachingScore(totalLaps, validLapCount, validLapEntries) {
  if (!totalLaps && !validLapCount) return null;

  const validRatio = totalLaps > 0 ? Math.min(validLapCount / totalLaps, 1) : 0;
  const times = validLapEntries
    .map(({ lap }) => Number(lap.lapTimeMs))
    .filter((value) => Number.isFinite(value) && value > 0);
  const average = times.length
    ? times.reduce((sum, value) => sum + value, 0) / times.length
    : null;
  const variance =
    average && times.length > 1
      ? times.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / times.length
      : 0;
  const consistency =
    average && times.length > 2
      ? Math.max(0, 1 - Math.min(Math.sqrt(variance) / average, 0.08) / 0.08)
      : Math.min(validLapCount / 3, 1) * 0.7;
  const dataDepth = Math.min(validLapCount / 15, 1);

  return Math.round(validRatio * 45 + consistency * 35 + dataDepth * 20);
}

function buildCareerStats(sessions, sessionLaps) {
  const weekStartMs = startOfCurrentWeekMs();
  let totalLaps = 0;
  let validLapCount = 0;
  const trackKeys = new Set();
  const weeklyTrackKeys = new Set();
  const validLapEntries = buildValidLapEntries(sessions, sessionLaps);

  for (const session of sessions) {
    const laps = sessionLaps[session.id];
    const summary = session.processedSummary || {};
    totalLaps += sessionTotalLaps(session, laps);

    const trackKey = normalizedTrackKey(session);
    if (trackKey && trackKey !== "unknown_track") trackKeys.add(trackKey);

    if (Array.isArray(laps) && laps.length > 0) {
      validLapCount += laps.filter(isValidLapForStats).length;
    } else {
      validLapCount +=
        numberOrNull(summary.validLapCount) ??
        numberOrNull(summary.validLaps) ??
        (summaryBestLapTimeMs(summary) ? 1 : 0);
    }
  }

  for (const entry of validLapEntries) {
    if (lapActivityMs(entry.lap, entry.session) >= weekStartMs) {
      weeklyTrackKeys.add(normalizedTrackKey(entry.session, entry.lap));
    }
  }

  const bestLap = [...validLapEntries].sort(
    (a, b) => Number(a.lap.lapTimeMs) - Number(b.lap.lapTimeMs)
  )[0];

  return {
    totalSessions: sessions.length,
    totalLaps,
    validLapCount,
    weeklyLeaderboardAppearances: weeklyTrackKeys.size,
    tracksDriven: trackKeys.size,
    bestLapTimeMs: bestLap?.lap?.lapTimeMs ?? null,
    bestLapTrack: bestLap?.session?.trackName || "Unknown Track",
    aiCoachingScore: calculateCoachingScore(totalLaps, validLapCount, validLapEntries),
  };
}

export default function Profile({ username, currentUser }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [sessionLaps, setSessionLaps] = useState({});
  const [careerStatsLoading, setCareerStatsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [favoriteTeam, setFavoriteTeam] = useState("ferrari");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [displayPhoto, setDisplayPhoto] = useState("original");

  const activeTeamTheme = useMemo(() => {
    return TEAM_THEMES[favoriteTeam] || getDefaultTheme();
  }, [favoriteTeam]);

  useEffect(() => {
    if (!username && !currentUser?.id) return;

    const applyResolvedProfile = (nextResolvedUser) => {
      setResolvedUser(nextResolvedUser);
      setError("");

      const localProfile = loadLocalProfile(username || nextResolvedUser?.username);
      const teamFromDb = nextResolvedUser.favoriteTeam || nextResolvedUser.favouriteTeam;
      const photoFromDb = nextResolvedUser.profilePhoto || nextResolvedUser.profileImageOriginal;
      const aiPhotoFromDb = nextResolvedUser.aiProfilePhoto || nextResolvedUser.profileImageAi;
      const displayPhotoFromDb = nextResolvedUser.displayPhoto;

      const resolvedTeam = teamFromDb || localProfile?.favoriteTeam || "ferrari";
      const resolvedPhoto = photoFromDb || localProfile?.profilePhoto || "";
      const resolvedAiPhoto = aiPhotoFromDb || localProfile?.aiProfilePhoto || "";
      const resolvedDisplayPhoto = displayPhotoFromDb || localProfile?.displayPhoto || "original";

      setFavoriteTeam(resolvedTeam);

      if (resolvedDisplayPhoto === "ai" && resolvedAiPhoto) {
        setProfilePhoto(resolvedAiPhoto);
      } else {
        setProfilePhoto(resolvedPhoto);
      }
      setDisplayPhoto(resolvedDisplayPhoto);
    };

    const resolveUser = async () => {
      try {
        if (currentUser?.id) {
          let nextResolvedUser = {
            ...currentUser,
            id: currentUser.id,
          };

          try {
            const userSnap = await getDoc(doc(db, "users", currentUser.id));
            if (userSnap.exists()) {
              nextResolvedUser = {
                id: userSnap.id,
                ...userSnap.data(),
              };
            }
          } catch (err) {
            console.warn("Exact user lookup failed; using logged-in account.", err);
          }

          applyResolvedProfile(nextResolvedUser);
          return;
        }

        const usernameKey = normalizeUsernameKey(username);
        if (!usernameKey) {
          setError("No user found for that username in database.");
          return;
        }

        const q = query(
          collection(db, "users"),
          where("usernameLower", "==", usernameKey),
          limit(1)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          setError("No user found for that username in database.");
          return;
        }

        const userDoc = snap.docs[0];
        applyResolvedProfile({
          id: userDoc.id,
          ...userDoc.data(),
        });
      } catch (err) {
        console.error("User resolve error:", err);
        setError(err.message || "Failed to resolve user.");
      }
    };

    resolveUser();
  }, [username, currentUser]);

  useEffect(() => {
    if (!resolvedUser?.id) return;

    const q = query(
      collection(db, "sessions"),
      where("userId", "==", resolvedUser.id),
      orderBy("startedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextSessions = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setSessions(nextSessions);
      },
      (err) => {
        console.error("Sessions listener error:", err);
        setError("Failed to load sessions.");
      }
    );

    return unsubscribe;
  }, [resolvedUser?.id]);

  const careerLapFetchKey = useMemo(
    () =>
      sessions
        .map((session) => {
          const summary = session.processedSummary || {};
          return [
            session.id,
            summary.totalLaps ?? "",
            summary.validLapCount ?? summary.validLaps ?? "",
            isActiveSession(session) ? "active" : "ended",
          ].join(":");
        })
        .sort()
        .join("|"),
    [sessions]
  );

  useEffect(() => {
    if (sessions.length === 0) {
      setSessionLaps({});
      setCareerStatsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCareerLaps() {
      const weekStartMs = startOfCurrentWeekMs();
      const sessionsToFetch = sessions
        .filter((session) => shouldFetchCareerLaps(session, weekStartMs))
        .slice(0, CAREER_LAP_DETAIL_LIMIT);

      if (sessionsToFetch.length === 0) {
        setSessionLaps({});
        setCareerStatsLoading(false);
        return;
      }

      setSessionLaps({});
      setCareerStatsLoading(true);

      try {
        const entries = [];

        for (let i = 0; i < sessionsToFetch.length; i += CAREER_LAP_FETCH_BATCH_SIZE) {
          const batch = sessionsToFetch.slice(i, i + CAREER_LAP_FETCH_BATCH_SIZE);
          const batchEntries = await Promise.all(
            batch.map(async (session) => {
              try {
                const lapsSnap = await getDocs(
                  collection(db, "sessions", session.id, "laps")
                );
                return [
                  session.id,
                  lapsSnap.docs.map((lapDoc) => ({
                    id: lapDoc.id,
                    ...lapDoc.data(),
                  })),
                ];
              } catch (err) {
                console.warn("Career lap stats failed for session:", session.id, err);
                return [session.id, null];
              }
            })
          );

          entries.push(...batchEntries);
          if (cancelled) return;
        }

        if (!cancelled) {
          setSessionLaps(Object.fromEntries(entries));
        }
      } finally {
        if (!cancelled) setCareerStatsLoading(false);
      }
    }

    loadCareerLaps();

    return () => {
      cancelled = true;
    };
  }, [careerLapFetchKey]);

  const profileThemeStyle = {
    "--profile-team-primary": activeTeamTheme.primary,
    "--profile-team-secondary": activeTeamTheme.secondary,
    "--profile-team-accent": activeTeamTheme.accent,
  };
  const displaySessions = useMemo(() => sortSessionsForDisplay(sessions), [sessions]);
  const latestId = useMemo(() => latestSessionId(sessions), [sessions]);
  const careerStats = useMemo(
    () => buildCareerStats(sessions, sessionLaps),
    [sessions, sessionLaps]
  );

  return (
    <div className="page-container profile-page" style={profileThemeStyle}>
      <h1>
        Driver <span className="text-green">Profile</span>
      </h1>

      <div className="profile-page-header">
        <p>
          Theme synced to: <strong>{activeTeamTheme.label}</strong>
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="profile-user-header">
            {profilePhoto && (
              <img src={profilePhoto} alt="Profile" className="profile-user-avatar" />
            )}
            <div className="profile-user-info">
              <h2>{username}</h2>
              <p>
                Status: <span className="text-green">Active</span>
              </p>
              <p>Academy: Republic Poly Sim Racing</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary profile-edit-btn"
            onClick={() => navigate("/edit-profile")}
          >
            Edit Profile
          </button>
        </div>

        <div className="card career-card">
          <div className="split-head">
            <div>
              <h2>Career Stats</h2>
              {careerStatsLoading && (
                <p className="career-stats-note">Updating stats...</p>
              )}
            </div>
            <span className="session-pill latest">
              {careerStats.totalSessions} sessions
            </span>
          </div>

          <div className="career-stats-grid">
            <div className="career-stat highlight">
              <span>Total Laps Recorded</span>
              <strong>{careerStats.totalLaps}</strong>
            </div>
            <div className="career-stat highlight">
              <span>AI Coaching Score</span>
              <strong>
                {careerStats.aiCoachingScore === null
                  ? "-"
                  : `${careerStats.aiCoachingScore}/100`}
              </strong>
            </div>
            <div className="career-stat">
              <span>Weekly Leaderboard Appearances</span>
              <strong>{careerStats.weeklyLeaderboardAppearances}</strong>
            </div>
            <div className="career-stat">
              <span>Best Valid Lap</span>
              <strong>{formatLapTime(careerStats.bestLapTimeMs)}</strong>
              <small>{careerStats.bestLapTimeMs ? careerStats.bestLapTrack : "No valid lap yet"}</small>
            </div>
            <div className="career-stat">
              <span>Valid Laps</span>
              <strong>{careerStats.validLapCount}</strong>
            </div>
            <div className="career-stat">
              <span>Tracks Driven</span>
              <strong>{careerStats.tracksDriven}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-listener-wrap">
        <ListenerTokenPanel />
      </div>

      <div className="card sessions-card">
        <h2>Your Sessions</h2>
        {error && <p className="profile-error-inline">{error}</p>}
        {sessions.length === 0 && !error ? (
          <p>No sessions found.</p>
        ) : (
          <div className="session-list">
            {displaySessions.map((session) => {
              const summary = session.processedSummary || {};
              const active = isActiveSession(session);
              const latest = session.id === latestId;

              return (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${encodeURIComponent(session.id)}`)}
                  className={`session-item ${active ? "active-session" : ""} ${
                    latest ? "latest-session" : ""
                  }`}
                >
                  <div className="session-track">
                    <strong>{session.trackName || "Unknown Track"}</strong>
                    <span className={active ? "session-pill active" : "session-pill"}>
                      {active ? "Active" : "Ended"}
                    </span>
                    {latest && <span className="session-pill latest">Latest</span>}
                  </div>
                  <div>Session Type: {session.sessionType ?? "-"}</div>
                  <div>Custom Setup: {formatSessionFlag(session.customSetup)}</div>
                  <div>Equal Performance: {formatSessionFlag(session.equalPerformance)}</div>
                  <div>Started: {formatDate(getSessionStartedAt(session))}</div>
                  <div>Ended: {formatDate(getSessionEndedAt(session))}</div>
                  <div>
                    Best Lap:{" "}
                    <span className="session-best-lap">
                      {formatLapTime(summary.bestLapTimeMs)}
                    </span>
                  </div>
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

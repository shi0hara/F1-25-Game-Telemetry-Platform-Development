import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
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
import { isActiveSession, latestSessionId, sortSessionsForDisplay } from "../utils/sessionUtils";

const PROFILE_STORAGE_PREFIX = "f1ProfilePrefs:";

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
  const fraction = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
    .toString()
    .padStart(3, "0")}`;
}

export default function Profile({ username }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [favoriteTeam, setFavoriteTeam] = useState("ferrari");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [displayPhoto, setDisplayPhoto] = useState("original");

  const activeTeamTheme = useMemo(() => {
    return TEAM_THEMES[favoriteTeam] || getDefaultTheme();
  }, [favoriteTeam]);

  useEffect(() => {
    if (!username) return;

    const resolveUser = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("usernameLower", "==", username.trim().toLowerCase()),
          limit(1)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          setError("No user found for that username in database.");
          return;
        }

        const userDoc = snap.docs[0];
        const nextResolvedUser = {
          id: userDoc.id,
          ...userDoc.data(),
        };

        setResolvedUser(nextResolvedUser);

        const localProfile = loadLocalProfile(username);
        const teamFromDb = nextResolvedUser.favoriteTeam || nextResolvedUser.favouriteTeam;
        const photoFromDb = nextResolvedUser.profilePhoto || nextResolvedUser.profileImageOriginal;
        const aiPhotoFromDb = nextResolvedUser.aiProfilePhoto || nextResolvedUser.profileImageAi;
        const displayPhotoFromDb = nextResolvedUser.displayPhoto;

        const resolvedTeam = teamFromDb || localProfile?.favoriteTeam || "ferrari";
        const resolvedPhoto = photoFromDb || localProfile?.profilePhoto || "";
        const resolvedAiPhoto = aiPhotoFromDb || localProfile?.aiProfilePhoto || "";
        const resolvedDisplayPhoto = displayPhotoFromDb || localProfile?.displayPhoto || "original";

        setFavoriteTeam(resolvedTeam);

        // Set the profile photo based on display preference
        if (resolvedDisplayPhoto === "ai" && resolvedAiPhoto) {
          setProfilePhoto(resolvedAiPhoto);
        } else {
          setProfilePhoto(resolvedPhoto);
        }
        setDisplayPhoto(resolvedDisplayPhoto);
      } catch (err) {
        console.error("User resolve error:", err);
        setError(err.message || "Failed to resolve user.");
      }
    };

    resolveUser();
  }, [username]);

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

  const profileThemeStyle = {
    "--profile-team-primary": activeTeamTheme.primary,
    "--profile-team-secondary": activeTeamTheme.secondary,
    "--profile-team-accent": activeTeamTheme.accent,
  };
  const displaySessions = useMemo(() => sortSessionsForDisplay(sessions), [sessions]);
  const latestId = useMemo(() => latestSessionId(sessions), [sessions]);

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
          <h2>Career Stats</h2>
          <p>Total Laps Recorded: 1,204</p>
          <p>Weekly Leaderboard Appearances: 4</p>
          <p>AI Coaching Score: 85/100</p>
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
                  <div>Started: {formatDate(session.startedAt)}</div>
                  <div>Ended: {formatDate(session.endedAt)}</div>
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

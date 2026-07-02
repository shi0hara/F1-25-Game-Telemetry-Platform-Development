import { useEffect, useMemo, useState } from "react";
import { collection, query, where, limit, getDocs, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import "./Profile.css";

const DEFAULT_THEME = {
  primary: "#E10600",
  secondary: "#FFD800",
  bgDark: "#111111",
  bgGrey: "#222222",
  bgLightGrey: "#333333",
  textWhite: "#FFFFFF",
  textMuted: "#CCCCCC",
  accentGreen: "#00A651",
  accentBlue: "#005AFF",
  accentYellow: "#FFD800",
};

const TEAM_THEMES = {
  Ferrari: {
    primary: "#E10600",
    secondary: "#FFD166",
    bgDark: "#120607",
    bgGrey: "#231012",
    bgLightGrey: "#3A171A",
  },
  McLaren: {
    primary: "#FF8000",
    secondary: "#4FD1FF",
    bgDark: "#130D05",
    bgGrey: "#231A11",
    bgLightGrey: "#3B291A",
  },
  Mercedes: {
    primary: "#00D2BE",
    secondary: "#D9FFF8",
    bgDark: "#071312",
    bgGrey: "#112623",
    bgLightGrey: "#1B3935",
  },
  "Red Bull": {
    primary: "#1E41FF",
    secondary: "#E10600",
    bgDark: "#080C1F",
    bgGrey: "#121A38",
    bgLightGrey: "#1C2754",
  },
  Williams: {
    primary: "#005AFF",
    secondary: "#9AD1FF",
    bgDark: "#061120",
    bgGrey: "#0E213F",
    bgLightGrey: "#17335D",
  },
  "Aston Martin": {
    primary: "#006F62",
    secondary: "#C7FDE8",
    bgDark: "#081310",
    bgGrey: "#112620",
    bgLightGrey: "#1A3A31",
  },
  Alpine: {
    primary: "#FF5BC2",
    secondary: "#00A3FF",
    bgDark: "#130A13",
    bgGrey: "#25142B",
    bgLightGrey: "#39203F",
  },
  Haas: {
    primary: "#B6BABD",
    secondary: "#E10600",
    bgDark: "#111111",
    bgGrey: "#1E1E1E",
    bgLightGrey: "#343434",
  },
  RB: {
    primary: "#6692FF",
    secondary: "#FFFFFF",
    bgDark: "#0B1020",
    bgGrey: "#16213D",
    bgLightGrey: "#22315A",
  },
  "Kick Sauber": {
    primary: "#52E252",
    secondary: "#D8FF8C",
    bgDark: "#0A1407",
    bgGrey: "#152812",
    bgLightGrey: "#223C1C",
  },
};

const THEME_VARIABLES = {
  primary: "--color-primary",
  secondary: "--color-secondary",
  bgDark: "--color-bg-dark",
  bgGrey: "--color-bg-grey",
  bgLightGrey: "--color-bg-light-grey",
  textWhite: "--color-text-white",
  textMuted: "--color-text-muted",
  accentGreen: "--color-accent-green",
  accentBlue: "--color-accent-blue",
  accentYellow: "--color-accent-yellow",
};

function formatDate(value) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value?.toDate?.() || new Date(value);
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

function applyTheme(theme) {
  if (typeof document === "undefined") return;

  Object.entries(THEME_VARIABLES).forEach(([key, cssVar]) => {
    const value = theme[key] ?? DEFAULT_THEME[key];
    document.documentElement.style.setProperty(cssVar, value);
  });
}

function getProfileStorageKey(username) {
  return `f1-profile:${username?.trim().toLowerCase() || "guest"}`;
}

function readStoredProfile(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch (err) {
    console.error("Profile settings load error:", err);
    return {};
  }
}

export default function Profile({ username, sessionId }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const storageKey = useMemo(() => getProfileStorageKey(username), [username]);
  const storedProfile = useMemo(() => readStoredProfile(storageKey), [storageKey]);
  const [favoriteTeam, setFavoriteTeam] = useState(() => storedProfile.favoriteTeam || "");
  const [profilePhoto, setProfilePhoto] = useState(() => storedProfile.profilePhoto || "");
  const [photoError, setPhotoError] = useState("");

  const theme = TEAM_THEMES[favoriteTeam] || DEFAULT_THEME;
  const teamNames = Object.keys(TEAM_THEMES);
  const sessionReference = sessionId ? sessionId.slice(0, 6).toUpperCase() : null;

  useEffect(() => {
    if (!username) return;

    const resolveUser = async () => {
      try {
        setError("");
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
        setResolvedUser({
          id: userDoc.id,
          ...userDoc.data(),
        });
      } catch (err) {
        console.error("User resolve error:", err);
        setError(err.message || "Failed to resolve user.");
      }
    };

    resolveUser();
  }, [username]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
        const nextSessions = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }));
        setSessions(nextSessions);
      },
      (snapshotError) => {
        console.error("Sessions listener error:", snapshotError);
        setError("Failed to load sessions.");
      }
    );

    return unsubscribe;
  }, [resolvedUser?.id]);

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file for your driver portrait.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfilePhoto(typeof reader.result === "string" ? reader.result : "");
      setPhotoError("");
    };
    reader.onerror = () => {
      setPhotoError("We could not load that photo. Please try another image.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="page-container profile-page">
      <div className="profile-page__header">
        <div>
          <p className="profile-page__eyebrow">Driver identity lab</p>
          <h1>
            Driver <span className="text-green">Profile</span>
          </h1>
          <p className="profile-page__copy">
            Capture a clean portrait, choose your favourite F1 team, and let the garage visuals shift
            to match your race-day colours.
          </p>
        </div>
        {favoriteTeam && (
          <div className="profile-team-pill" aria-label={`Favourite team ${favoriteTeam}`}>
            <span className="profile-team-pill__dot" />
            {favoriteTeam} theme live
          </div>
        )}
      </div>

      <div className="grid-2 profile-overview-grid">
        <section className="card profile-card profile-card--hero">
          <div className="profile-identity-row">
            <div>
              <h2>{username}</h2>
              <p>
                Status: <span className="text-green">Active</span>
              </p>
              <p>Academy: Republic Poly Sim Racing</p>
              {sessionReference && <p>Live telemetry sync: #{sessionReference}</p>}
            </div>
            <div className="profile-avatar-shell">
              {profilePhoto ? (
                <div className="profile-avatar-render" aria-label="AI racing portrait preview">
                  <img className="profile-avatar-image" src={profilePhoto} alt={`${username} racing portrait`} />
                  <div className="profile-avatar-glow" />
                  <div className="profile-avatar-suit" aria-hidden="true">
                    <span className="profile-avatar-suit__shoulder profile-avatar-suit__shoulder--left" />
                    <span className="profile-avatar-suit__shoulder profile-avatar-suit__shoulder--right" />
                    <span className="profile-avatar-suit__torso" />
                    <span className="profile-avatar-suit__trim" />
                  </div>
                  {favoriteTeam && <span className="profile-avatar-badge">{favoriteTeam}</span>}
                </div>
              ) : (
                <div className="profile-avatar-placeholder">
                  <span>Driver portrait pending</span>
                </div>
              )}
            </div>
          </div>

          <div className="profile-upload-panel">
            <div>
              <h3>Camera-ready capture</h3>
              <p className="profile-supporting-copy">
                Frame your body from head to mid-thigh, face the camera, and keep your arms slightly
                away from your torso so the suit render can wrap around you more cleanly.
              </p>
            </div>
            <label className="profile-upload-button btn-primary" htmlFor="profile-photo-input">
              Take or upload profile photo
            </label>
            <input
              id="profile-photo-input"
              className="profile-photo-input"
              type="file"
              accept="image/*"
              capture="user"
              onChange={handlePhotoChange}
            />
            {photoError && <p className="profile-error">{photoError}</p>}
          </div>
        </section>

        <section className="card profile-card profile-card--stats">
          <h2>Career Stats</h2>
          <p>Total Laps Recorded: 1,204</p>
          <p>Weekly Leaderboard Appearances: 4</p>
          <p>AI Coaching Score: 85/100</p>

          <div className="profile-theme-panel">
            <div>
              <h3>Favourite team</h3>
              <p className="profile-supporting-copy">
                Once your photo is captured, choose the team colours you want across the app.
              </p>
            </div>
            <select
              value={favoriteTeam}
              onChange={(event) => setFavoriteTeam(event.target.value)}
              disabled={!profilePhoto}
              aria-label="Select favourite F1 team"
            >
              <option value="">Select your F1 team</option>
              {teamNames.map((teamName) => (
                <option key={teamName} value={teamName}>
                  {teamName}
                </option>
              ))}
            </select>
            {!profilePhoto && (
              <p className="profile-supporting-copy">Capture your photo first to unlock team theming.</p>
            )}
            {favoriteTeam && (
              <div className="profile-theme-preview" aria-live="polite">
                <span className="profile-theme-swatch" />
                <span>{favoriteTeam} colours are now active for your dashboard.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card profile-card profile-card--sessions">
        <h2>Your Sessions</h2>
        {error && <p className="profile-error">{error}</p>}
        {sessions.length === 0 && !error ? (
          <p>No sessions found.</p>
        ) : (
          <div className="profile-session-list">
            {sessions.map((session) => {
              const isSelected = selectedSession?.id === session.id;
              const summary = session.processedSummary || {};

              return (
                <button
                  key={session.id}
                  type="button"
                  className={`profile-session-card${isSelected ? " profile-session-card--selected" : ""}`}
                  onClick={() => setSelectedSession(session)}
                >
                  <div className="profile-session-card__track">
                    <strong>{session.trackName || "Unknown Track"}</strong>
                  </div>
                  <div>Session Type: {session.sessionType ?? "-"}</div>
                  <div>Started: {formatDate(session.startedAt)}</div>
                  <div>Ended: {formatDate(session.endedAt)}</div>
                  <div>
                    Best Lap: <span className="text-green">{formatLapTime(summary.bestLapTimeMs)}</span>
                  </div>
                  <div>Top Speed: {summary.topSpeedKph ?? 0} km/h</div>
                  <div>Total Laps: {summary.totalLaps ?? 0}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

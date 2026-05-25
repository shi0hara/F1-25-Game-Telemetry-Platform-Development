import { useEffect, useState } from "react";
import { collection, query, where, limit, getDocs, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../firebase";

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

export default function Profile({ username, sessionId }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

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

  return (
    <div className="page-container">
      <h1>Driver <span className="text-green">Profile</span></h1>
      <div className="grid-2">
        <div className="card">
          <h2>{username}</h2>
          <p>Status: <span className="text-green">Active</span></p>
          <p>Academy: Republic Poly Sim Racing</p>
        </div>
        <div className="card" style={{ borderLeftColor: 'var(--color-accent-yellow)' }}>
          <h2>Career Stats</h2>
          <p>Total Laps Recorded: 1,204</p>
          <p>Weekly Leaderboard Appearances: 4</p>
          <p>AI Coaching Score: 85/100</p>
        </div>
      </div>
      
      <div className="card" style={{ marginTop: '20px' }}>
        <h2>Your Sessions</h2>
        {error && <p style={{ color: "red" }}>{error}</p>}
        {sessions.length === 0 && !error ? (
          <p>No sessions found.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {sessions.map((session) => {
              const isSelected = selectedSession?.id === session.id;
              const summary = session.processedSummary || {};

              return (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  style={{
                     textAlign: "left",
                     padding: 12,
                     border: isSelected ? "2px solid #555" : "1px solid #333",
                     borderRadius: 8,
                     background: isSelected ? "#2a2a2a" : "#1a1a1a",
                     color: "#fff",
                     cursor: "pointer",
                  }}
                >
                  <div style={{ color: 'var(--color-accent-yellow)' }}><strong>{session.trackName || "Unknown Track"}</strong></div>
                  <div>Session Type: {session.sessionType ?? "-"}</div>
                  <div>Started: {formatDate(session.startedAt)}</div>
                  <div>Ended: {formatDate(session.endedAt)}</div>
                  <div>
                    Best Lap: <span style={{ color: 'var(--color-accent-green)' }}>{formatLapTime(summary.bestLapTimeMs)}</span>
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
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";

function toMillis(value) {
  if (!value) return 0;

  // Firestore Timestamp
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  // Firestore Timestamp-like object
  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  // ISO string / Date
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasTelemetry(session) {
  return Boolean(
    session?.latestTelemetry ||
      session?.latestMapPosition ||
      session?.latestTelemetryAt
  );
}

function isActiveSession(session) {
  return !session?.endedAt;
}

function pickBestSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const activeSessions = sessions.filter(isActiveSession);

  // Prefer active sessions that are actually receiving telemetry.
  const activeWithTelemetry = activeSessions
    .filter(hasTelemetry)
    .sort((a, b) => {
      const aTime = toMillis(a.latestTelemetryAt) || toMillis(a.startedAt);
      const bTime = toMillis(b.latestTelemetryAt) || toMillis(b.startedAt);
      return bTime - aTime;
    });

  if (activeWithTelemetry.length > 0) {
    return activeWithTelemetry[0];
  }

  // Then prefer any active session.
  if (activeSessions.length > 0) {
    return activeSessions[0];
  }

  // Fallback to latest session.
  return sessions[0];
}

export default function useAutoSession() {
  const [sessionId, setSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const sessionsRef = collection(db, "sessions");

    const q = query(
      sessionsRef,
      orderBy("startedAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLoading(false);
        setError("");

        if (snapshot.empty) {
          setSessionId(null);
          setSessionData(null);
          setSessions([]);
          return;
        }

        const docs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        const bestSession = pickBestSession(docs);

        setSessions(docs);
        setSessionId(bestSession?.id || null);
        setSessionData(bestSession || null);
      },
      (err) => {
        console.error("Auto session detection error:", err);
        setLoading(false);
        setError(err.message || "Failed to auto-detect session.");
      }
    );

    return unsubscribe;
  }, []);

  const activeTrackKey = useMemo(() => {
    if (sessionData?.trackKey) return sessionData.trackKey;
    if (sessionData?.trackId != null) return `track_${sessionData.trackId}`;
    return null;
  }, [sessionData]);

  return {
    sessionId,
    sessionData,
    sessions,
    activeTrackKey,
    loading,
    error,
  };
}

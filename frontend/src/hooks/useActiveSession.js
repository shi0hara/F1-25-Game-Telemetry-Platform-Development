import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

function toMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTrackKeyFromSession(session) {
  if (session?.trackKey) return session.trackKey;
  if (session?.trackId != null) return `track_${session.trackId}`;
  return null;
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

  if (activeSessions.length > 0) {
    return activeSessions[0];
  }

  return sessions[0];
}

/**
 * If username is provided:
 *   - resolves username -> user
 *   - watches that user's sessions
 *
 * If username is empty:
 *   - watches latest global sessions
 *
 * Returns:
 * {
 *   sessionId,
 *   sessionData,
 *   activeTrackKey,
 *   userId,
 *   userData,
 *   sessions,
 *   loading,
 *   error
 * }
 */
export default function useActiveSession(username) {
  const normalizedUsername = useMemo(() => {
    return String(username || "").trim().toLowerCase();
  }, [username]);

  const [userId, setUserId] = useState(null);
  const [userData, setUserData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    setError("");
    setUserId(null);
    setUserData(null);
    setSessionId(null);
    setSessionData(null);
    setSessions([]);

    if (!normalizedUsername) {
      return () => {
        cancelled = true;
      };
    }

    async function resolveUser() {
      try {
        setLoading(true);

        const q = query(
          collection(db, "users"),
          where("usernameLower", "==", normalizedUsername),
          limit(1)
        );

        const snap = await getDocs(q);

        if (cancelled) return;

        if (snap.empty) {
          setError("No user found for this username.");
          setLoading(false);
          return;
        }

        const userDoc = snap.docs[0];
        const nextUser = {
          id: userDoc.id,
          ...userDoc.data(),
        };

        setUserId(userDoc.id);
        setUserData(nextUser);
      } catch (err) {
        if (!cancelled) {
          console.error("User resolve error:", err);
          setError(err.message || "Failed to resolve user.");
          setLoading(false);
        }
      }
    }

    resolveUser();

    return () => {
      cancelled = true;
    };
  }, [normalizedUsername]);

  useEffect(() => {
    if (normalizedUsername && !userId) {
      return;
    }

    setLoading(true);
    setError("");

    const sessionsQuery = normalizedUsername
      ? query(
          collection(db, "sessions"),
          where("userId", "==", userId),
          orderBy("startedAt", "desc"),
          limit(20)
        )
      : query(
          collection(db, "sessions"),
          orderBy("startedAt", "desc"),
          limit(20)
        );

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        setLoading(false);
        setError("");

        const docs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        setSessions(docs);

        const bestSession = pickBestSession(docs);

        setSessionId(bestSession?.id || null);
        setSessionData(bestSession || null);
      },
      (err) => {
        console.error("Sessions listener error:", err);
        setLoading(false);
        setError(err.message || "Failed to load sessions.");
      }
    );

    return unsubscribe;
  }, [normalizedUsername, userId]);

  const activeTrackKey = useMemo(() => {
    return getTrackKeyFromSession(sessionData);
  }, [sessionData]);

  return {
    sessionId,
    sessionData,
    activeTrackKey,
    userId,
    userData,
    sessions,
    loading,
    error,
  };
}

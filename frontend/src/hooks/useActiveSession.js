/**
 * useActiveSession.js — Active Session Hook
 * ============================================
 * Custom React hook that resolves the user's active telemetry session from Firestore.
 * 
 * Workflow:
 * 1. Resolves the user ID (from prop or by querying Firestore by username)
 * 2. Subscribes to real-time session updates via Firestore onSnapshot
 * 3. Picks the "best" session (active with live telemetry > active > most recent)
 * 4. Returns session data, user data, and all sessions for display
 * 
 * The hook supports two modes:
 * - Per-user: queries sessions belonging to a specific user
 * - All sessions: queries all sessions globally (for admin/leaderboard views)
 */

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
import {
  getUserDisplayName,
  getUserId,
  normalizeUsernameKey,
} from "../utils/userIdentity";

/**
 * Converts various Firestore timestamp formats to milliseconds since epoch.
 * Handles: Firestore Timestamp objects, {seconds, nanoseconds} objects,
 * plain numbers (assumed ms), and ISO date strings.
 */
function toMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTrackKeyFromSession(session) {
  if (session?.trackKey) return session.trackKey;
  if (session?.trackId != null) return `track_${session.trackId}`;
  return null;
}

function getSessionFreshness(session) {
  return (
    toMillis(session?.latestMapPosition?.timestamp) ||
    toMillis(session?.latestTelemetry?.timestamp) ||
    toMillis(session?.latestTelemetryAt) ||
    toMillis(session?.updatedAt) ||
    toMillis(session?.startedAt)
  );
}

function hasLiveTelemetry(session) {
  return Boolean(
    session?.latestMapPosition?.worldX != null ||
      session?.latestMapPosition?.worldZ != null ||
      session?.latestTelemetry?.speedKph != null ||
      session?.latestTelemetry
  );
}

function hasEndedAt(value) {
  if (!value) return false;
  if (typeof value.toMillis === "function") return true;
  if (typeof value.toDate === "function") return true;
  if (typeof value.seconds === "number") return true;
  if (typeof value._seconds === "number") return true;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function isActiveSession(session) {
  return Boolean(session) && !hasEndedAt(session.endedAt) && !hasEndedAt(session.endedAtIso);
}

/**
 * Selects the best session from a list based on priority:
 * 1. Active sessions with live telemetry data (most recent first)
 * 2. Active sessions without telemetry
 * 3. Any session with telemetry
 * 4. Most recent session overall
 */
function pickBestSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const sorted = [...sessions].sort((a, b) => {
    const aFresh = getSessionFreshness(a);
    const bFresh = getSessionFreshness(b);
    return bFresh - aFresh;
  });

  const activeWithLiveTelemetry = sorted.find(
    (session) => isActiveSession(session) && hasLiveTelemetry(session)
  );

  if (activeWithLiveTelemetry) {
    return activeWithLiveTelemetry;
  }

  const activeSession = sorted.find(isActiveSession);

  if (activeSession) {
    return activeSession;
  }

  const anyWithLiveTelemetry = sorted.find(hasLiveTelemetry);

  if (anyWithLiveTelemetry) {
    return anyWithLiveTelemetry;
  }

  return sorted[0];
}

export default function useActiveSession(userOrUsername, options = {}) {
  const includeAllSessions = options?.includeAllSessions === true;
  const sessionLimit = Number.isFinite(Number(options?.sessionLimit))
    ? Number(options.sessionLimit)
    : 50;
  const knownUserId = useMemo(() => getUserId(userOrUsername), [userOrUsername]);
  const username = useMemo(
    () => getUserDisplayName(userOrUsername),
    [userOrUsername]
  );
  const normalizedUsername = useMemo(() => {
    return normalizeUsernameKey(username);
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

    if (includeAllSessions) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (knownUserId) {
      setUserId(knownUserId);
      setUserData(
        typeof userOrUsername === "object"
          ? { ...userOrUsername, id: knownUserId }
          : { id: knownUserId, username }
      );
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!normalizedUsername) {
      setLoading(false);
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

        setUserId(userDoc.id);
        setUserData({
          id: userDoc.id,
          ...userDoc.data(),
        });
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
  }, [includeAllSessions, knownUserId, normalizedUsername, userOrUsername, username]);

  useEffect(() => {
    if (includeAllSessions) {
      setLoading(true);
      setError("");

      const sessionsQuery = query(
        collection(db, "sessions"),
        limit(sessionLimit)
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

          const bestSession = pickBestSession(docs);

          setSessions(docs);
          setSessionId(bestSession?.id || null);
          setSessionData(bestSession || null);
        },
        (err) => {
          console.error("All sessions listener error:", err);
          setLoading(false);
          setError(err.message || "Failed to load sessions.");
        }
      );

      return unsubscribe;
    }

    if (!knownUserId && !normalizedUsername) {
      setLoading(false);
      setError("");
      return;
    }

    if (!userId || (knownUserId && userId !== knownUserId)) {
      return;
    }

    setLoading(true);
    setError("");

    const sessionsQuery = query(
      collection(db, "sessions"),
      where("userId", "==", userId),
      orderBy("startedAt", "desc"),
      limit(50)
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

        const bestSession = pickBestSession(docs);

        // Keep the full history visible and auto-select the best available session.
        // Active sessions still win, but ended sessions are usable for review pages.
        setSessions(docs);
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
  }, [includeAllSessions, knownUserId, normalizedUsername, sessionLimit, userId]);

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

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Resolves the logged-in username to a Firestore user document,
 * then subscribes to their most recent (active) session in real-time.
 *
 * Returns { sessionId, userId, loading, error }
 */
export default function useActiveSession(username) {
  const [userId, setUserId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Resolve username -> userId
  useEffect(() => {
    if (!username) {
      setUserId(null);
      setSessionId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const resolveUser = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("usernameLower", "==", username.trim().toLowerCase()),
          limit(1)
        );

        const snap = await getDocs(q);

        if (cancelled) return;

        if (snap.empty) {
          setError("No user found in database for this username.");
          setLoading(false);
          return;
        }

        setUserId(snap.docs[0].id);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to resolve user.");
          setLoading(false);
        }
      }
    };

    resolveUser();

    return () => {
      cancelled = true;
    };
  }, [username]);

  // Step 2: Subscribe to the user's most recent session
  useEffect(() => {
    if (!userId) {
      setSessionId(null);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "sessions"),
      where("userId", "==", userId),
      orderBy("startedAt", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setSessionId(null);
        } else {
          setSessionId(snapshot.docs[0].id);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Active session listener error:", err);
        setError(err.message || "Failed to load active session.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  return { sessionId, userId, loading, error };
}

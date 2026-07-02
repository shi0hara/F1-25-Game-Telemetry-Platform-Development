import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";

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
      limit(10)
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

        setSessions(docs);

        const activeSession =
          docs.find((session) => !session.endedAt) || docs[0];

        setSessionId(activeSession.id);
        setSessionData(activeSession);
      },
      (err) => {
        console.error("Auto session detection error:", err);
        setLoading(false);
        setError(err.message || "Failed to auto-detect session.");
      }
    );

    return unsubscribe;
  }, []);

  return {
    sessionId,
    sessionData,
    sessions,
    loading,
    error,
  };
}

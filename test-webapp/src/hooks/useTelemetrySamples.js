import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

export default function useTelemetrySamples(sessionId) {
  const [samples, setSamples] = useState([]);

  useEffect(() => {
    if (!sessionId) return;

    const samplesRef = collection(db, "sessions", sessionId, "samples");

    const q = query(
      samplesRef,
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setSamples(rows.reverse());
    });

    return () => unsubscribe();
  }, [sessionId]);

  return samples;
}
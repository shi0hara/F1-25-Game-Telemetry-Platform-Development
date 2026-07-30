/**
 * useTelemetrySamples.js — Real-time Telemetry Samples Hook
 * ============================================================
 * Subscribes to the Firestore subcollection `sessions/{sessionId}/samples`
 * and returns the latest 8000 telemetry samples in chronological order.
 * 
 * Uses Firestore onSnapshot for real-time updates — as new samples arrive
 * from the backend (which receives them from the Python listener), the
 * component re-renders with the updated data.
 * 
 * @param {string} sessionId - The Firestore session document ID to subscribe to
 * @returns {Array} Array of telemetry sample objects sorted oldest → newest
 */

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
      limit(8000)
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
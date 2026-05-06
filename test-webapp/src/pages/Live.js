import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  query,
} from "firebase/firestore";
import { db } from "../firebase";

export default function LiveTelemetry() {
  const [telemetry, setTelemetry] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "sessions"), limit(1));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setError("No documents found in the sessions collection.");
          setTelemetry(null);
          return;
        }

        const sessionDoc = snapshot.docs[0];
        const data = sessionDoc.data();

        setSessionId(sessionDoc.id);

        if (!data.latestTelemetry) {
          setError("Session found, but latestTelemetry field is missing.");
          setTelemetry(null);
          return;
        }

        setError("");
        setTelemetry(data.latestTelemetry);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setError(err.message);
      }
    );

    return () => unsubscribe();
  }, []);

  if (!telemetry) {
    return (
      <div>
        <h2>Live Telemetry</h2>
        {sessionId && <p>Session ID: {sessionId}</p>}
        {error && <p style={{ color: "red" }}>Error: {error}</p>}
        <p>Waiting for telemetry...</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Live Telemetry</h2>

      <p>Session ID: {sessionId}</p>
      <p>Speed: {telemetry.speedKph ?? 0} km/h</p>
      <p>Throttle: {((telemetry.throttle ?? 0) * 100).toFixed(0)}%</p>
      <p>Brake: {((telemetry.brake ?? 0) * 100).toFixed(0)}%</p>
      <p>Steering: {telemetry.steering.toFixed(2)}</p>
      <p>Gear: {telemetry.gear ?? "-"}</p>
      <p>RPM: {telemetry.rpm ?? 0}</p>
      <p>DRS: {telemetry.drs ? "On" : "Off"}</p>
      <p>Lap: {telemetry.lapNumber ?? "-"}</p>
      <p>Delta to PB: {telemetry.deltaToPB ?? "-"} ms</p>
      <p>
        Cornering Speed:{" "}
        {telemetry.corneringSpeed == null
          ? "Not calculated yet"
          : `${telemetry.corneringSpeed} km/h`}
      </p>
      <p>
        Braking Distance:{" "}
        {telemetry.brakingDistance == null
          ? "Not calculated yet"
          : `${telemetry.brakingDistance} m`}
      </p>
      <p>Last Updated: {telemetry.timestamp ?? "-"}</p>
    </div>
  );
}
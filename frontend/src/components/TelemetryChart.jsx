import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function formatTime(ms) {
  if (ms == null || ms <= 0) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const fraction = ms % 1000;
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
      .toString()
      .padStart(3, "0")}`;
  }
  return `${seconds}.${fraction.toString().padStart(3, "0")}`;
}

function isLapValid(value) {
  return value !== false && value !== 0 && value !== "false";
}

export default function TelemetryChart({ sessionId }) {
  const [laps, setLaps] = useState([]);
  const [bestLap, setBestLap] = useState(null);
  const [bestS1, setBestS1] = useState(null);
  const [bestS2, setBestS2] = useState(null);
  const [bestS3, setBestS3] = useState(null);

  useEffect(() => {
    if (!sessionId) return;

    const lapsRef = collection(db, "sessions", sessionId, "laps");
    const q = query(lapsRef, orderBy("lapNumber", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLaps(rows);

      let bLap = null, bS1 = null, bS2 = null, bS3 = null;

      for (const lap of rows) {
        const valid = isLapValid(lap.valid);
        if (!valid) continue;

        if (lap.lapTimeMs > 0 && (bLap === null || lap.lapTimeMs < bLap)) bLap = lap.lapTimeMs;
        if (lap.sector1Ms > 0 && (bS1 === null || lap.sector1Ms < bS1)) bS1 = lap.sector1Ms;
        if (lap.sector2Ms > 0 && (bS2 === null || lap.sector2Ms < bS2)) bS2 = lap.sector2Ms;
        if (lap.sector3Ms > 0 && (bS3 === null || lap.sector3Ms < bS3)) bS3 = lap.sector3Ms;
      }

      setBestLap(bLap);
      setBestS1(bS1);
      setBestS2(bS2);
      setBestS3(bS3);
    });

    return () => unsubscribe();
  }, [sessionId]);

  if (laps.length === 0) {
    return <p style={{ color: "#888" }}>No lap times recorded yet.</p>;
  }

  const getCellColor = (value, best) => {
    if (value == null || value <= 0 || best == null) return "#ccc";
    if (value === best) return "#a855f7";
    if (value < best * 1.02) return "#22c55e";
    if (value > best * 1.05) return "#f59e0b";
    return "#ccc";
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #333", color: "#aaa", textAlign: "left" }}>
            <th style={{ padding: "8px 10px" }}>Lap</th>
            <th style={{ padding: "8px 10px" }}>Sector 1</th>
            <th style={{ padding: "8px 10px" }}>Sector 2</th>
            <th style={{ padding: "8px 10px" }}>Sector 3</th>
            <th style={{ padding: "8px 10px" }}>Lap Time</th>
            <th style={{ padding: "8px 10px" }}>Valid</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => {
            const valid = isLapValid(lap.valid);
            const rowStyle = {
              borderBottom: "1px solid #222",
              opacity: valid ? 1 : 0.5,
            };

            return (
              <tr key={lap.id} style={rowStyle}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                  {lap.lapNumber}
                </td>
                <td style={{ padding: "8px 10px", color: getCellColor(lap.sector1Ms, bestS1) }}>
                  {formatTime(lap.sector1Ms)}
                </td>
                <td style={{ padding: "8px 10px", color: getCellColor(lap.sector2Ms, bestS2) }}>
                  {formatTime(lap.sector2Ms)}
                </td>
                <td style={{ padding: "8px 10px", color: getCellColor(lap.sector3Ms, bestS3) }}>
                  {formatTime(lap.sector3Ms)}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontWeight: 600,
                    color: getCellColor(lap.lapTimeMs, bestLap),
                  }}
                >
                  {formatTime(lap.lapTimeMs)}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {valid ? (
                    <span style={{ color: "#22c55e" }}>✓</span>
                  ) : (
                    <span style={{ color: "#ef4444" }}>✗</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {bestLap && (
        <div
          style={{
            marginTop: "12px",
            fontSize: "12px",
            color: "#94a3b8",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <span>
            Best Lap: <strong style={{ color: "#a855f7" }}>{formatTime(bestLap)}</strong>
          </span>
          {bestS1 && (
            <span>
              Best S1: <strong style={{ color: "#a855f7" }}>{formatTime(bestS1)}</strong>
            </span>
          )}
          {bestS2 && (
            <span>
              Best S2: <strong style={{ color: "#a855f7" }}>{formatTime(bestS2)}</strong>
            </span>
          )}
          {bestS3 && (
            <span>
              Best S3: <strong style={{ color: "#a855f7" }}>{formatTime(bestS3)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

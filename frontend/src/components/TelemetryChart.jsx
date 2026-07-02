import { useEffect, useMemo, useState } from "react";
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
  return value === true || value === 1 || value === "true";
}

function sameLap(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

export default function TelemetryChart({ sessionId, selectedLapNumber = null }) {
  const [laps, setLaps] = useState([]);
  const [bestLap, setBestLap] = useState(null);
  const [bestS1, setBestS1] = useState(null);
  const [bestS2, setBestS2] = useState(null);
  const [bestS3, setBestS3] = useState(null);

  useEffect(() => {
    if (!sessionId) return undefined;

    const lapsRef = collection(db, "sessions", sessionId, "laps");
    const q = query(lapsRef, orderBy("lapNumber", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setLaps(rows);

      let nextBestLap = null;
      let nextBestS1 = null;
      let nextBestS2 = null;
      let nextBestS3 = null;

      for (const lap of rows) {
        const valid = isLapValid(lap.valid);
        if (!valid) continue;

        if (
          lap.lapTimeMs > 0 &&
          (nextBestLap === null || lap.lapTimeMs < nextBestLap)
        ) {
          nextBestLap = lap.lapTimeMs;
        }

        if (
          lap.sector1Ms > 0 &&
          (nextBestS1 === null || lap.sector1Ms < nextBestS1)
        ) {
          nextBestS1 = lap.sector1Ms;
        }

        if (
          lap.sector2Ms > 0 &&
          (nextBestS2 === null || lap.sector2Ms < nextBestS2)
        ) {
          nextBestS2 = lap.sector2Ms;
        }

        if (
          lap.sector3Ms > 0 &&
          (nextBestS3 === null || lap.sector3Ms < nextBestS3)
        ) {
          nextBestS3 = lap.sector3Ms;
        }
      }

      setBestLap(nextBestLap);
      setBestS1(nextBestS1);
      setBestS2(nextBestS2);
      setBestS3(nextBestS3);
    });

    return () => unsubscribe();
  }, [sessionId]);

  const selectedLap = useMemo(() => {
    if (selectedLapNumber == null) return null;
    return laps.find((lap) => sameLap(lap.lapNumber, selectedLapNumber)) || null;
  }, [laps, selectedLapNumber]);

  const getCellColor = (value, best) => {
    if (value == null || value <= 0 || best == null) return "#ccc";
    if (value === best) return "#a855f7";
    if (value < best * 1.02) return "#22c55e";
    if (value > best * 1.05) return "#f59e0b";
    return "#ccc";
  };

  return (
    <div>
      <div
        style={{
          padding: "12px",
          marginBottom: "14px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        {selectedLapNumber == null ? (
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            Viewing the current live lap. Full lap timing appears here after the
            lap is completed.
          </p>
        ) : selectedLap ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "10px",
            }}
          >
            <div>
              <strong>Lap</strong>
              <div>{selectedLap.lapNumber}</div>
            </div>
            <div>
              <strong>Sector 1</strong>
              <div>{formatTime(selectedLap.sector1Ms)}</div>
            </div>
            <div>
              <strong>Sector 2</strong>
              <div>{formatTime(selectedLap.sector2Ms)}</div>
            </div>
            <div>
              <strong>Sector 3</strong>
              <div>{formatTime(selectedLap.sector3Ms)}</div>
            </div>
            <div>
              <strong>Lap Time</strong>
              <div>{formatTime(selectedLap.lapTimeMs)}</div>
            </div>
            <div>
              <strong>Valid</strong>
              <div>{isLapValid(selectedLap.valid) ? "Yes" : "No"}</div>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            Lap {selectedLapNumber} is selected on the map. Its timing row has
            not been saved yet.
          </p>
        )}
      </div>

      {laps.length === 0 ? (
        <p style={{ color: "#888" }}>No lap times recorded yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid #333",
                  color: "#aaa",
                  textAlign: "left",
                }}
              >
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
                const selected = sameLap(lap.lapNumber, selectedLapNumber);

                return (
                  <tr
                    key={lap.id}
                    style={{
                      borderBottom: "1px solid #222",
                      opacity: valid ? 1 : 0.5,
                      background: selected
                        ? "rgba(59,130,246,0.14)"
                        : "transparent",
                      outline: selected
                        ? "1px solid rgba(59,130,246,0.55)"
                        : "none",
                    }}
                  >
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                      {lap.lapNumber}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: getCellColor(lap.sector1Ms, bestS1),
                      }}
                    >
                      {formatTime(lap.sector1Ms)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: getCellColor(lap.sector2Ms, bestS2),
                      }}
                    >
                      {formatTime(lap.sector2Ms)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: getCellColor(lap.sector3Ms, bestS3),
                      }}
                    >
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
                        <span style={{ color: "#22c55e" }}>Yes</span>
                      ) : (
                        <span style={{ color: "#ef4444" }}>No</span>
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
                Best Lap:{" "}
                <strong style={{ color: "#a855f7" }}>
                  {formatTime(bestLap)}
                </strong>
              </span>
              {bestS1 && (
                <span>
                  Best S1:{" "}
                  <strong style={{ color: "#a855f7" }}>
                    {formatTime(bestS1)}
                  </strong>
                </span>
              )}
              {bestS2 && (
                <span>
                  Best S2:{" "}
                  <strong style={{ color: "#a855f7" }}>
                    {formatTime(bestS2)}
                  </strong>
                </span>
              )}
              {bestS3 && (
                <span>
                  Best S3:{" "}
                  <strong style={{ color: "#a855f7" }}>
                    {formatTime(bestS3)}
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

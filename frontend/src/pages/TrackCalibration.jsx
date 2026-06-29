import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function TrackCalibration({
  sessionId,
  trackKey = "track_12",
  imageUrl = "/maps/singapore.png",
  imageWidth = 1200,
  imageHeight = 800,
}) {
  const imageRef = useRef(null);

  const [latestMapPosition, setLatestMapPosition] = useState(null);
  const [anchorPoints, setAnchorPoints] = useState([]);
  const [label, setLabel] = useState("Start line");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!sessionId) return;

    const sessionRef = doc(db, "sessions", sessionId);

    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) return;

      const data = snapshot.data();
      setLatestMapPosition(data.latestMapPosition || null);
    });

    return unsubscribe;
  }, [sessionId]);

  function handleImageClick(event) {
    if (!latestMapPosition) {
      setMessage("No live world position yet. Start the listener first.");
      return;
    }

    const img = imageRef.current;
    const rect = img.getBoundingClientRect();

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Convert displayed click position into actual image pixel coordinate.
    const scaleX = imageWidth / rect.width;
    const scaleY = imageHeight / rect.height;

    const imageX = clickX * scaleX;
    const imageY = clickY * scaleY;

    const point = {
      label: label || `Point ${anchorPoints.length + 1}`,

      worldX: Number(latestMapPosition.worldX),
      worldZ: Number(latestMapPosition.worldZ),

      imageX: Number(imageX.toFixed(2)),
      imageY: Number(imageY.toFixed(2)),
    };

    setAnchorPoints((prev) => [...prev, point]);
    setMessage(`Added anchor: ${point.label}`);
  }

  async function saveCalibration() {
    if (anchorPoints.length < 3) {
      setMessage("You need at least 3 anchor points.");
      return;
    }

    const trackRef = doc(db, "trackMaps", trackKey);

    await setDoc(
      trackRef,
      {
        imageCalibration: {
          imageUrl,
          imageWidth,
          imageHeight,
          anchorPoints,
          calibratedAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );

    setMessage("Calibration saved to Firebase.");
  }

  function removeAnchor(index) {
    setAnchorPoints((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        color: "white",
        padding: "24px",
      }}
    >
      <h1>Track Calibration</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#181818",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <h2>Live World Position</h2>

          {latestMapPosition ? (
            <>
              <p>
                <strong>World X:</strong>{" "}
                {Number(latestMapPosition.worldX).toFixed(2)}
              </p>
              <p>
                <strong>World Z:</strong>{" "}
                {Number(latestMapPosition.worldZ).toFixed(2)}
              </p>
              <p>
                <strong>Speed:</strong>{" "}
                {latestMapPosition.speedKph ?? "-"} km/h
              </p>
            </>
          ) : (
            <p>Waiting for live map position...</p>
          )}

          <hr style={{ borderColor: "rgba(255,255,255,0.12)" }} />

          <label>
            Anchor label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{
                width: "100%",
                marginTop: "6px",
                padding: "8px",
                borderRadius: "8px",
                border: "1px solid #444",
                background: "#111",
                color: "white",
              }}
            />
          </label>

          <p style={{ fontSize: "13px", color: "#aaa" }}>
            Drive to the real location in-game, then click the matching
            location on the image.
          </p>

          <button
            onClick={saveCalibration}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            Save Calibration
          </button>

          {message && <p style={{ color: "#93c5fd" }}>{message}</p>}

          <h3>Anchor Points ({anchorPoints.length})</h3>

          <div style={{ display: "grid", gap: "8px" }}>
            {anchorPoints.map((point, index) => (
              <div
                key={`${point.label}-${index}`}
                style={{
                  background: "#111",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <strong>{index + 1}. {point.label}</strong>
                <p style={{ margin: "4px 0", fontSize: "13px" }}>
                  World: {point.worldX.toFixed(2)}, {point.worldZ.toFixed(2)}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13px" }}>
                  Image: {point.imageX.toFixed(2)}, {point.imageY.toFixed(2)}
                </p>
                <button
                  onClick={() => removeAnchor(index)}
                  style={{
                    marginTop: "4px",
                    background: "#7f1d1d",
                    color: "white",
                    border: "none",
                    padding: "5px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            background: "#111",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Track map"
            onClick={handleImageClick}
            style={{
              width: "100%",
              display: "block",
              cursor: "crosshair",
              userSelect: "none",
            }}
            draggable={false}
          />

          {anchorPoints.map((point, index) => (
            <div
              key={`marker-${index}`}
              style={{
                position: "absolute",
                left: `${(point.imageX / imageWidth) * 100}%`,
                top: `${(point.imageY / imageHeight) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "#22c55e",
                border: "2px solid white",
                pointerEvents: "none",
              }}
              title={point.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import useActiveSession from "../hooks/useActiveSession";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function getTrackKeyFromSession(data) {
  if (data?.trackKey) return data.trackKey;
  if (data?.trackId != null) return `track_${data.trackId}`;
  return null;
}

function getDefaultImage(trackKey) {
  const mapImages = {
    track_0: "/maps/albert-park.svg",
    track_12: "/maps/singapore.png",
    track_11: "/maps/monza.png",
    track_13: "/maps/suzuka.png",
  };

  return mapImages[trackKey] || "/maps/default-track.png";
}

function getDefaultLabel(index) {
  if (index === 0) return "Start line";
  if (index === 1) return "Turn 1";
  if (index === 2) return "Final corner";
  return `Point ${index + 1}`;
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export default function TrackCalibration({
  username,
  sessionId: providedSessionId,
  trackKey: providedTrackKey,
  imageUrl: providedImageUrl,
  imageWidth: providedImageWidth = 1200,
  imageHeight: providedImageHeight = 800,
}) {
  const imageRef = useRef(null);

  const {
    sessionId: activeSessionId,
    sessionData: activeSessionData,
    loading: sessionLoading,
    error: activeSessionError,
  } = useActiveSession(username);

  const sessionId = providedSessionId || activeSessionId;

  const [liveSessionData, setLiveSessionData] = useState(null);
  const [trackMap, setTrackMap] = useState(null);
  const [latestMapPosition, setLatestMapPosition] = useState(null);
  const [anchorPoints, setAnchorPoints] = useState([]);
  const [label, setLabel] = useState("Start line");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setLiveSessionData(null);
      setLatestMapPosition(null);
      return;
    }

    const sessionRef = doc(db, "sessions", sessionId);

    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setLiveSessionData(null);
          setLatestMapPosition(null);
          return;
        }

        const data = snapshot.data();

        setLiveSessionData(data);
        setLatestMapPosition(data.latestMapPosition || null);
      },
      (err) => {
        console.error("Session listener error:", err);
        setMessage(err.message || "Failed to load session.");
      }
    );

    return unsubscribe;
  }, [sessionId]);

  const activeTrackKey = useMemo(() => {
    return (
      providedTrackKey ||
      getTrackKeyFromSession(liveSessionData) ||
      getTrackKeyFromSession(activeSessionData) ||
      "track_0"
    );
  }, [providedTrackKey, liveSessionData, activeSessionData]);

  useEffect(() => {
    if (!activeTrackKey) {
      setTrackMap(null);
      return;
    }

    const trackRef = doc(db, "trackMaps", activeTrackKey);

    const unsubscribe = onSnapshot(
      trackRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setTrackMap(null);

          if (!dirty) {
            setAnchorPoints([]);
          }

          return;
        }

        const data = snapshot.data();
        setTrackMap(data);

        const savedAnchors = data.imageCalibration?.anchorPoints;

        if (!dirty && Array.isArray(savedAnchors)) {
          setAnchorPoints(savedAnchors);
          setLabel(getDefaultLabel(savedAnchors.length));
        }
      },
      (err) => {
        console.error("Track map listener error:", err);
        setMessage(err.message || "Failed to load track map.");
      }
    );

    return unsubscribe;
  }, [activeTrackKey, dirty]);

  const imageCalibration = trackMap?.imageCalibration || null;

  const imageUrl =
    providedImageUrl ||
    imageCalibration?.imageUrl ||
    getDefaultImage(activeTrackKey);

  const imageWidth = Number(
    imageCalibration?.imageWidth || providedImageWidth || 1200
  );

  const imageHeight = Number(
    imageCalibration?.imageHeight || providedImageHeight || 800
  );

  async function generateReferenceLine() {
    if (!sessionId) {
      setMessage("No active session found.");
      return;
    }

    try {
      setIsGenerating(true);
      setMessage("Generating reference line from this session...");

      const res = await fetch(
        `${API_BASE}/sessions/${sessionId}/track-map/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxPoints: 800,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate reference line.");
      }

      setMessage(
        `Reference line generated. Track key: ${data.trackKey}, points: ${data.centerlinePointCount}`
      );
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Failed to generate reference line.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleImageClick(event) {
    if (!latestMapPosition) {
      setMessage("No live world position yet. Start the listener first.");
      return;
    }

    if (
      !hasNumber(latestMapPosition.worldX) ||
      !hasNumber(latestMapPosition.worldZ)
    ) {
      setMessage("Current session has no worldX/worldZ yet.");
      return;
    }

    const img = imageRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const scaleX = imageWidth / rect.width;
    const scaleY = imageHeight / rect.height;

    const imageX = clickX * scaleX;
    const imageY = clickY * scaleY;

    const point = {
      label: label || getDefaultLabel(anchorPoints.length),
      worldX: Number(Number(latestMapPosition.worldX).toFixed(4)),
      worldZ: Number(Number(latestMapPosition.worldZ).toFixed(4)),
      imageX: Number(imageX.toFixed(2)),
      imageY: Number(imageY.toFixed(2)),
    };

    setAnchorPoints((prev) => {
      const next = [...prev, point];
      setLabel(getDefaultLabel(next.length));
      return next;
    });

    setDirty(true);
    setMessage(`Added anchor: ${point.label}`);
  }

  async function saveCalibration() {
    if (!activeTrackKey) {
      setMessage("No track key found.");
      return;
    }

    if (anchorPoints.length < 3) {
      setMessage("You need at least 3 anchor points.");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("Saving calibration...");

      const trackRef = doc(db, "trackMaps", activeTrackKey);

      await setDoc(
        trackRef,
        {
          trackKey: activeTrackKey,
          trackId: liveSessionData?.trackId ?? activeSessionData?.trackId ?? null,
          trackName:
            liveSessionData?.trackName ?? activeSessionData?.trackName ?? null,
          imageCalibration: {
            imageUrl,
            imageWidth,
            imageHeight,
            anchorPoints,
            calibratedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setDirty(false);
      setMessage("Calibration saved to Firebase.");
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Failed to save calibration.");
    } finally {
      setIsSaving(false);
    }
  }

  function removeAnchor(index) {
    setAnchorPoints((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setLabel(getDefaultLabel(next.length));
      return next;
    });

    setDirty(true);
  }

  function clearAnchors() {
    setAnchorPoints([]);
    setLabel("Start line");
    setDirty(true);
    setMessage("Cleared local anchor points. Save to update Firebase.");
  }

  return (
    <div className="page-container">
      <h1>
        Track <span className="text-blue">Calibration</span>
      </h1>

      {sessionLoading && <p>Detecting active session...</p>}

      {activeSessionError && (
        <p style={{ color: "red" }}>
          Active session error: {activeSessionError}
        </p>
      )}

      {!sessionLoading && !sessionId && (
        <p style={{ color: "orange" }}>
          No active session found. Start the telemetry listener first.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <div
          className="card"
          style={{ borderLeftColor: "var(--color-accent-blue)" }}
        >
          <h2>Calibration Data</h2>

          <p>
            <strong>Session:</strong> {sessionId || "-"}
          </p>

          <p>
            <strong>Track Key:</strong> {activeTrackKey || "-"}
          </p>

          <p>
            <strong>Track:</strong>{" "}
            {liveSessionData?.trackName || activeSessionData?.trackName || "-"}
          </p>

          <p>
            <strong>Image:</strong> {imageUrl}
          </p>

          <hr style={{ borderColor: "rgba(255,255,255,0.12)" }} />

          <h3>Live World Position</h3>

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
                <strong>Speed:</strong> {latestMapPosition.speedKph ?? "-"} km/h
              </p>
            </>
          ) : (
            <p>Waiting for live map position...</p>
          )}

          <hr style={{ borderColor: "rgba(255,255,255,0.12)" }} />

          <button
            onClick={generateReferenceLine}
            disabled={isGenerating || !sessionId}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: "#16a34a",
              color: "white",
              cursor: "pointer",
              marginTop: "10px",
              opacity: isGenerating || !sessionId ? 0.6 : 1,
            }}
          >
            {isGenerating ? "Generating..." : "Generate Reference Line"}
          </button>

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
            Drive to a real point in-game, then click the same point on the
            image.
          </p>

          <button
            onClick={saveCalibration}
            disabled={isSaving || anchorPoints.length < 3}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
              marginTop: "10px",
              opacity: isSaving || anchorPoints.length < 3 ? 0.6 : 1,
            }}
          >
            {isSaving ? "Saving..." : "Save Calibration"}
          </button>

          <button
            onClick={clearAnchors}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: "#7f1d1d",
              color: "white",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            Clear Anchors
          </button>

          {message && <p style={{ color: "#93c5fd" }}>{message}</p>}

          <h3>Anchor Points ({anchorPoints.length})</h3>

          {anchorPoints.length < 3 && (
            <p style={{ color: "orange", fontSize: "13px" }}>
              You need at least 3 points. Use points far apart from each other.
            </p>
          )}

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
                <strong>
                  {index + 1}. {point.label}
                </strong>

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
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#22c55e",
                border: "2px solid white",
                pointerEvents: "none",
                boxShadow: "0 0 12px rgba(34,197,94,0.8)",
              }}
              title={point.label}
            >
              <span
                style={{
                  position: "absolute",
                  left: "20px",
                  top: "-2px",
                  color: "white",
                  background: "rgba(0,0,0,0.7)",
                  padding: "2px 5px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                }}
              >
                {index + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

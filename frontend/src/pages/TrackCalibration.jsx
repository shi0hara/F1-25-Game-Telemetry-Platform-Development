/**
 * TrackCalibration.jsx — Track Map Calibration Tool
 * ============================
 * Admin tool for calibrating track map images against live world-coordinate telemetry.
 * The user drives on-track while clicking corresponding positions on the map image to
 * create anchor points. These anchors are saved to Firebase and used by the affine
 * transform system to project live car positions onto 2D track maps across the platform.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import useActiveSession from "../hooks/useActiveSession";
import {
  getLocalListenerLiveSample,
  subscribeLocalListenerLive,
} from "../services/localListenerService";
import {
  getDefaultTrackMapImage,
  resolveTrackMapImageUrl,
} from "../utils/mapImages";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getTrackKeyFromSession(data) {
  if (data?.trackKey) return data.trackKey;
  if (data?.trackId != null) return `track_${data.trackId}`;
  return null;
}

function getDefaultImage(trackKey) {
  return getDefaultTrackMapImage(trackKey);
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

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPayloadMapPosition(payload) {
  const sample = payload?.latestMapPosition || payload?.latestTelemetry || null;
  if (!sample) return null;

  const worldX = toFiniteNumber(sample.worldX);
  const worldZ = toFiniteNumber(sample.worldZ);
  if (worldX === null || worldZ === null) return null;

  return {
    ...sample,
    worldX,
    worldY: toFiniteNumber(sample.worldY) ?? sample.worldY,
    worldZ,
    speedKph: toFiniteNumber(sample.speedKph) ?? sample.speedKph,
  };
}

function isAdminUser(user) {
  return user?.isAdmin === true || user?.role === "admin";
}

function isPayloadForCurrentUser(payload, currentUser, username) {
  if (!payload?.paired) return false;
  if (isAdminUser(currentUser)) return true;

  const payloadUserId = String(payload.userId || "").trim();
  const currentUserId = String(currentUser?.id || currentUser?.userId || "").trim();
  if (payloadUserId && currentUserId) return payloadUserId === currentUserId;

  const payloadUsername = String(payload.username || "").trim().toLowerCase();
  const currentUsername = String(currentUser?.username || username || "")
    .trim()
    .toLowerCase();

  return Boolean(payloadUsername && currentUsername && payloadUsername === currentUsername);
}

export default function TrackCalibration({
  username,
  currentUser,
  sessionId: providedSessionId,
  trackKey: providedTrackKey,
  imageUrl: providedImageUrl,
  imageWidth: providedImageWidth = 1200,
  imageHeight: providedImageHeight = 675,
}) {
  const imageRef = useRef(null);

  const {
    sessionId: activeSessionId,
    sessionData: activeSessionData,
    loading: sessionLoading,
    error: activeSessionError,
  } = useActiveSession(currentUser || username);

  const [localLivePayload, setLocalLivePayload] = useState(null);
  const localSessionId = localLivePayload?.sessionId || null;
  const sessionId = providedSessionId || localSessionId || activeSessionId;
  const localMapPosition = useMemo(
    () => getPayloadMapPosition(localLivePayload),
    [localLivePayload]
  );

  const [liveSessionData, setLiveSessionData] = useState(null);
  const [trackMap, setTrackMap] = useState(null);
  const [latestMapPosition, setLatestMapPosition] = useState(null);
  const [anchorPoints, setAnchorPoints] = useState([]);
  const [label, setLabel] = useState("Start line");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    let pollTimer = 0;

    function acceptPayload(payload) {
      if (cancelled || !payload?.sessionId) return;
      if (!isPayloadForCurrentUser(payload, currentUser, username)) return;

      const mapPosition = getPayloadMapPosition(payload);
      if (!mapPosition) return;

      setLocalLivePayload((previous) => {
        const previousSequence = Number(previous?.sequence);
        const nextSequence = Number(payload.sequence);

        if (
          Number.isFinite(previousSequence) &&
          Number.isFinite(nextSequence) &&
          nextSequence < previousSequence
        ) {
          return previous;
        }

        return {
          ...payload,
          latestMapPosition: mapPosition,
          latestTelemetry: {
            ...(payload.latestTelemetry || {}),
            ...mapPosition,
          },
        };
      });
    }

    const subscription = subscribeLocalListenerLive({
      onSample: acceptPayload,
      onStatus: acceptPayload,
    });

    async function pollLocalListener() {
      try {
        const payload = await getLocalListenerLiveSample(180);
        acceptPayload(payload);
      } catch {
        // Firestore remains the fallback when the local listener is unavailable.
      } finally {
        if (!cancelled) {
          pollTimer = window.setTimeout(
            pollLocalListener,
            subscription.supported ? 750 : 250
          );
        }
      }
    }

    pollLocalListener();

    return () => {
      cancelled = true;
      subscription.close();
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [currentUser, username]);

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
        setLatestMapPosition(data.latestMapPosition || data.latestTelemetry || null);
      },
      (err) => {
        console.error("Session listener error:", err);
        setMessage(err.message || "Failed to load session.");
      }
    );

    return unsubscribe;
  }, [sessionId]);

  const shownSessionData = useMemo(() => {
    if (liveSessionData) return liveSessionData;
    if (sessionId && sessionId === activeSessionId) return activeSessionData;
    return null;
  }, [activeSessionData, activeSessionId, liveSessionData, sessionId]);

  const shownMapPosition = localMapPosition || latestMapPosition;

  const activeTrackKey = useMemo(() => {
    return (
      providedTrackKey ||
      getTrackKeyFromSession(shownSessionData) ||
      "track_0"
    );
  }, [providedTrackKey, shownSessionData]);

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

  const defaultImageUrl = getDefaultImage(activeTrackKey);
  const primaryImageUrl = resolveTrackMapImageUrl(
    providedImageUrl ||
      imageCalibration?.imageUrl,
    activeTrackKey,
    defaultImageUrl
  );
  const imageUrl =
    failedImageUrl === primaryImageUrl && primaryImageUrl !== defaultImageUrl
      ? defaultImageUrl
      : primaryImageUrl;
  const hasMapImage = Boolean(imageUrl);

  useEffect(() => {
    setFailedImageUrl("");
  }, [primaryImageUrl]);

  const imageWidth = Number(
    imageCalibration?.imageWidth || providedImageWidth || 1200
  );

  const imageHeight = Number(
    imageCalibration?.imageHeight || providedImageHeight || 675
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
          headers: getAuthHeaders(),
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
    if (!shownMapPosition) {
      setMessage("No live world position yet. Start the listener first.");
      return;
    }

    if (
      !hasNumber(shownMapPosition.worldX) ||
      !hasNumber(shownMapPosition.worldZ)
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
      worldX: Number(Number(shownMapPosition.worldX).toFixed(4)),
      worldZ: Number(Number(shownMapPosition.worldZ).toFixed(4)),
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

      const res = await fetch(
        `${API_BASE}/track-maps/${encodeURIComponent(activeTrackKey)}/calibration`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            trackId: shownSessionData?.trackId ?? null,
            trackName: shownSessionData?.trackName ?? null,
            imageUrl,
            imageWidth,
            imageHeight,
            anchorPoints,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save calibration.");
      }

      setTrackMap(data);
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
            {shownSessionData?.trackName || "-"}
          </p>

          <p>
            <strong>Live Source:</strong>{" "}
            {localMapPosition ? "Local listener" : "Firebase"}
          </p>

          <p>
            <strong>Image:</strong> {imageUrl || "No image"}
          </p>

          <hr style={{ borderColor: "rgba(255,255,255,0.12)" }} />

          <h3>Live World Position</h3>

          {shownMapPosition ? (
            <>
              <p>
                <strong>World X:</strong>{" "}
                {Number(shownMapPosition.worldX).toFixed(2)}
              </p>

              <p>
                <strong>World Z:</strong>{" "}
                {Number(shownMapPosition.worldZ).toFixed(2)}
              </p>

              <p>
                <strong>Speed:</strong> {shownMapPosition.speedKph ?? "-"} km/h
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
            width: "100%",
            maxWidth: hasMapImage ? undefined : "720px",
            margin: hasMapImage ? undefined : "0 auto",
            background: "#111",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {imageUrl ? (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Track map"
              onClick={handleImageClick}
              onError={() => {
                if (imageUrl !== defaultImageUrl) {
                  setFailedImageUrl(imageUrl);
                  setMessage("Saved map image was missing. Showing this track with no image.");
                }
              }}
              style={{
                width: "100%",
                display: "block",
                cursor: "crosshair",
                userSelect: "none",
              }}
              draggable={false}
            />
          ) : (
            <div
              ref={imageRef}
              onClick={handleImageClick}
              style={{
                width: "100%",
                aspectRatio: `${imageWidth} / ${imageHeight}`,
                cursor: "crosshair",
                userSelect: "none",
                background: "#07111f",
              }}
            />
          )}

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

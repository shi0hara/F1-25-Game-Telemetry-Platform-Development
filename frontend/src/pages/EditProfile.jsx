import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  updateDoc,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAiRacingSuit } from "../hooks/useAiRacingSuit.js";
import { validateImageFile } from "../services/fileValidator.js";
import { downscaleForPersistence } from "../services/imageDownscaler.js";
import "./Profile.css";

const PROFILE_STORAGE_PREFIX = "f1ProfilePrefs:";

const TEAM_THEMES = {
  ferrari: {
    label: "Scuderia Ferrari",
    primary: "#E10600",
    secondary: "#111111",
    accent: "#FFD966",
  },
  mercedes: {
    label: "Mercedes-AMG Petronas",
    primary: "#00D2BE",
    secondary: "#0A0E12",
    accent: "#B8FFFA",
  },
  redbull: {
    label: "Oracle Red Bull Racing",
    primary: "#1E41FF",
    secondary: "#0C1230",
    accent: "#F1C545",
  },
  mclaren: {
    label: "McLaren",
    primary: "#FF8000",
    secondary: "#1A1A1A",
    accent: "#A7D8FF",
  },
  astonmartin: {
    label: "Aston Martin Aramco",
    primary: "#006F62",
    secondary: "#0C1715",
    accent: "#95EEDC",
  },
  alpine: {
    label: "BWT Alpine",
    primary: "#0090FF",
    secondary: "#130F30",
    accent: "#FF87D1",
  },
  williams: {
    label: "Williams Racing",
    primary: "#005AFF",
    secondary: "#12151E",
    accent: "#6FD1FF",
  },
  haas: {
    label: "MoneyGram Haas",
    primary: "#E8E8E8",
    secondary: "#1A1A1A",
    accent: "#D0122D",
  },
  racingbulls: {
    label: "Visa Cash App Racing Bulls",
    primary: "#1434CB",
    secondary: "#0A0E1A",
    accent: "#FFFFFF",
  },
  kicksauber: {
    label: "Kick Sauber",
    primary: "#00E701",
    secondary: "#0F1210",
    accent: "#FFFFFF",
  },
};

function getProfileStorageKey(username) {
  return `${PROFILE_STORAGE_PREFIX}${String(username || "").trim().toLowerCase()}`;
}

function getDefaultTheme() {
  return TEAM_THEMES.ferrari;
}

function loadLocalProfile(username) {
  if (!username) return null;

  try {
    const raw = localStorage.getItem(getProfileStorageKey(username));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalProfile(username, payload) {
  if (!username) return;
  localStorage.setItem(getProfileStorageKey(username), JSON.stringify(payload));
}

function downscaleToJpegDataUrlFromImage(image, quality = 0.85) {
  const maxSize = 720;
  const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
  const width = Math.round(image.width * ratio);
  const height = Math.round(image.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });
}

async function buildAiOutfitImage(baseImageDataUrl, teamKey) {
  const image = await loadImage(baseImageDataUrl);
  const theme = TEAM_THEMES[teamKey] || getDefaultTheme();

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(image, 0, 0);

  const shoulderY = Math.round(canvas.height * 0.48);
  const suitTopY = Math.round(canvas.height * 0.42);
  const suitBottomY = canvas.height;

  const bodyGradient = ctx.createLinearGradient(0, suitTopY, 0, suitBottomY);
  bodyGradient.addColorStop(0, `${theme.primary}D9`);
  bodyGradient.addColorStop(1, `${theme.secondary}D9`);
  ctx.fillStyle = bodyGradient;
  ctx.fillRect(0, suitTopY, canvas.width, suitBottomY - suitTopY);

  const stripeWidth = Math.max(6, Math.round(canvas.width * 0.03));
  ctx.fillStyle = `${theme.accent}CC`;
  ctx.fillRect(Math.round(canvas.width * 0.46), suitTopY, stripeWidth, suitBottomY - suitTopY);
  ctx.fillRect(Math.round(canvas.width * 0.54), suitTopY, stripeWidth, suitBottomY - suitTopY);

  ctx.strokeStyle = `${theme.accent}EE`;
  ctx.lineWidth = Math.max(3, Math.round(canvas.width * 0.008));
  ctx.beginPath();
  ctx.moveTo(Math.round(canvas.width * 0.2), shoulderY);
  ctx.lineTo(Math.round(canvas.width * 0.42), Math.round(canvas.height * 0.62));
  ctx.moveTo(Math.round(canvas.width * 0.8), shoulderY);
  ctx.lineTo(Math.round(canvas.width * 0.58), Math.round(canvas.height * 0.62));
  ctx.stroke();

  ctx.fillStyle = `${theme.secondary}CC`;
  ctx.beginPath();
  ctx.ellipse(
    Math.round(canvas.width * 0.5),
    Math.round(canvas.height * 0.44),
    Math.round(canvas.width * 0.11),
    Math.round(canvas.height * 0.05),
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  return downscaleToJpegDataUrlFromImage(canvas, 0.82);
}

export default function EditProfile({ username }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [favoriteTeam, setFavoriteTeam] = useState("ferrari");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [aiProfilePhoto, setAiProfilePhoto] = useState("");
  const [displayPhoto, setDisplayPhoto] = useState("original");
  const [cameraError, setCameraError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [askTeamAfterPhoto, setAskTeamAfterPhoto] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraSectionRef = useRef(null);

  const aiSuit = useAiRacingSuit();

  const activeTeamTheme = useMemo(() => {
    return TEAM_THEMES[favoriteTeam] || getDefaultTheme();
  }, [favoriteTeam]);

  const hasProfilePhoto = Boolean(profilePhoto);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [cameraActive]);

  useEffect(() => {
    if (!cameraActive || !cameraSectionRef.current) return;

    cameraSectionRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [cameraActive]);

  useEffect(() => {
    if (!username) return;

    const resolveUser = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("usernameLower", "==", username.trim().toLowerCase()),
          limit(1)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          setError("No user found for that username in database.");
          return;
        }

        const userDoc = snap.docs[0];
        const nextResolvedUser = {
          id: userDoc.id,
          ...userDoc.data(),
        };

        setResolvedUser(nextResolvedUser);

        const localProfile = loadLocalProfile(username);
        const teamFromDb = nextResolvedUser.favoriteTeam || nextResolvedUser.favouriteTeam;
        const photoFromDb = nextResolvedUser.profilePhoto || nextResolvedUser.profileImageOriginal;
        const aiPhotoFromDb = nextResolvedUser.aiProfilePhoto || nextResolvedUser.profileImageAi;

        const resolvedTeam = teamFromDb || localProfile?.favoriteTeam || "ferrari";
        const resolvedPhoto = photoFromDb || localProfile?.profilePhoto || "";
        const resolvedAiPhoto = aiPhotoFromDb || localProfile?.aiProfilePhoto || "";
        const resolvedDisplayPhoto = nextResolvedUser.displayPhoto || localProfile?.displayPhoto || "original";

        setFavoriteTeam(resolvedTeam);
        setProfilePhoto(resolvedPhoto);
        setAiProfilePhoto(resolvedAiPhoto);
        setDisplayPhoto(resolvedDisplayPhoto);
      } catch (err) {
        console.error("User resolve error:", err);
        setError(err.message || "Failed to resolve user.");
      }
    };

    resolveUser();
  }, [username]);

  async function persistProfile(nextPayload) {
    setSavingProfile(true);
    setError("");

    try {
      const downscaledPhoto = nextPayload.profilePhoto
        ? await downscaleForPersistence(nextPayload.profilePhoto)
        : "";
      const downscaledAiPhoto = nextPayload.aiProfilePhoto
        ? await downscaleForPersistence(nextPayload.aiProfilePhoto)
        : "";

      const payload = {
        favoriteTeam: nextPayload.favoriteTeam,
        profilePhoto: downscaledPhoto,
        aiProfilePhoto: downscaledAiPhoto,
        displayPhoto: nextPayload.displayPhoto,
      };

      try {
        if (resolvedUser?.id) {
          await updateDoc(doc(db, "users", resolvedUser.id), payload);
        }
        saveLocalProfile(username, payload);
      } catch (err) {
        console.error("Failed to save profile:", err);
        saveLocalProfile(username, payload);
        setError("Saved locally. Cloud sync failed.");
      }
    } catch (err) {
      console.error("Failed to downscale images:", err);
      const fallbackPayload = {
        favoriteTeam: nextPayload.favoriteTeam,
        profilePhoto: nextPayload.profilePhoto,
        aiProfilePhoto: nextPayload.aiProfilePhoto,
        displayPhoto: nextPayload.displayPhoto,
      };
      saveLocalProfile(username, fallbackPayload);
      setError("Saved locally. Cloud sync failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function startCamera() {
    setCameraError("");

    if (cameraSectionRef.current) {
      cameraSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera capture is not supported in this browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      setCameraError(err.message || "Unable to access the camera.");
      setCameraActive(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function updateProfileFromImageData(imageDataUrl, keepTeamPrompt = true) {
    try {
      setProfilePhoto(imageDataUrl);

      if (keepTeamPrompt) {
        setAskTeamAfterPhoto(true);
      }

      await persistProfile({
        favoriteTeam,
        profilePhoto: imageDataUrl,
        aiProfilePhoto,
        displayPhoto,
      });
    } catch (err) {
      console.error("Failed to process profile image:", err);
      setError("Unable to process image. Please try again.");
    }
  }

  async function removeProfilePhoto() {
    setProfilePhoto("");
    setAiProfilePhoto("");
    setDisplayPhoto("original");
    await persistProfile({
      favoriteTeam,
      profilePhoto: "",
      aiProfilePhoto: "",
      displayPhoto: "original",
    });
  }

  async function generateAiSuit() {
    if (!profilePhoto) return;

    try {
      const aiImage = await aiSuit.generate(profilePhoto, favoriteTeam, {
        primary: activeTeamTheme.primary,
        secondary: activeTeamTheme.secondary,
        accent: activeTeamTheme.accent,
      });

      const finalAiImage = aiImage || await buildAiOutfitImage(profilePhoto, favoriteTeam);

      setAiProfilePhoto(finalAiImage);

      await persistProfile({
        favoriteTeam,
        profilePhoto,
        aiProfilePhoto: finalAiImage,
        displayPhoto,
      });
    } catch (err) {
      console.error("Failed to generate AI racing suit:", err);
      setError("Unable to generate racing suit. Please try again.");
    }
  }

  async function captureFromCamera() {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    await updateProfileFromImageData(imageDataUrl, true);
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const sourceDataUrl = String(reader.result || "");
      if (!sourceDataUrl) return;
      await updateProfileFromImageData(sourceDataUrl, true);
    };
    reader.onerror = () => {
      setError("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  }

  async function handleTeamChange(nextTeam) {
    setFavoriteTeam(nextTeam);
    setAskTeamAfterPhoto(false);

    const nextTheme = TEAM_THEMES[nextTeam] || getDefaultTheme();
    let nextAiPhoto = aiProfilePhoto;

    // Regenerate AI suit if a profile photo exists
    if (profilePhoto) {
      try {
        const aiImage = await aiSuit.generate(profilePhoto, nextTeam, {
          primary: nextTheme.primary,
          secondary: nextTheme.secondary,
          accent: nextTheme.accent,
        });

        nextAiPhoto = aiImage || await buildAiOutfitImage(profilePhoto, nextTeam);
        setAiProfilePhoto(nextAiPhoto);
      } catch {
        // Fall back to local canvas generation
        try {
          nextAiPhoto = await buildAiOutfitImage(profilePhoto, nextTeam);
          setAiProfilePhoto(nextAiPhoto);
        } catch {
          // Keep previous AI photo if generation fails entirely
        }
      }
    }

    await persistProfile({
      favoriteTeam: nextTeam,
      profilePhoto,
      aiProfilePhoto: nextAiPhoto,
      displayPhoto,
    });
  }

  async function handleSetDisplayPhoto(choice) {
    setDisplayPhoto(choice);
    await persistProfile({
      favoriteTeam,
      profilePhoto,
      aiProfilePhoto,
      displayPhoto: choice,
    });
  }

  const profileThemeStyle = {
    "--profile-team-primary": activeTeamTheme.primary,
    "--profile-team-secondary": activeTeamTheme.secondary,
    "--profile-team-accent": activeTeamTheme.accent,
  };

  return (
    <div className="page-container profile-page" style={profileThemeStyle}>
      <div className="edit-profile-header">
        <h1>
          Edit <span className="text-green">Profile</span>
        </h1>
        <button type="button" className="btn-secondary profile-back-btn" onClick={() => navigate("/profile")}>
          ← Back to Profile
        </button>
      </div>

      <div className="profile-page-header">
        <p className="profile-theme-line">
          Theme synced to: <strong>{activeTeamTheme.label}</strong>
        </p>
        {savingProfile && <span className="profile-saving-tag">Saving profile...</span>}
      </div>

      {error && <p className="profile-error">{error}</p>}

      <div className="card profile-media-card">
        <h2>Profile Media Studio</h2>
        <p className="profile-help-text">
          Frame tip: keep your full face near the top of the guide and both shoulders fully inside
          the frame for a cleaner racing-suit render.
        </p>

        <div className="profile-photo-grid">
          <div className="profile-photo-slot">
            <h3>Original</h3>
            {hasProfilePhoto ? (
              <img src={profilePhoto} alt="Original profile" className={`profile-photo${displayPhoto === "original" ? " photo-active" : ""}`} />
            ) : (
              <div className="profile-placeholder">No profile image yet.</div>
            )}
            {hasProfilePhoto && (
              <button
                type="button"
                className={`btn-secondary btn-set-display${displayPhoto === "original" ? " active" : ""}`}
                onClick={() => handleSetDisplayPhoto("original")}
                disabled={displayPhoto === "original"}
              >
                {displayPhoto === "original" ? "✓ Current Profile Photo" : "Use as Profile Photo"}
              </button>
            )}
          </div>

          <div className="profile-photo-slot">
            <h3>AI Racing Suit</h3>
            {aiSuit.isGenerating && (
              <div className="ai-generating-overlay">
                <div className="ai-spinner" aria-label="Generating"></div>
                <p>Generating your racing suit (~15-30 seconds)</p>
              </div>
            )}
            {aiProfilePhoto && !aiSuit.isGenerating ? (
              <img
                src={aiProfilePhoto}
                alt="AI-styled racing suit profile"
                className={`profile-photo ai-racing-suit-photo${displayPhoto === "ai" ? " photo-active" : ""}`}
              />
            ) : !aiSuit.isGenerating ? (
              <div className="profile-placeholder">
                {hasProfilePhoto
                  ? "Click below to generate your AI racing suit."
                  : "Upload or capture a photo first."}
              </div>
            ) : null}
            {aiProfilePhoto && !aiSuit.isGenerating && (
              <button
                type="button"
                className={`btn-secondary btn-set-display${displayPhoto === "ai" ? " active" : ""}`}
                onClick={() => handleSetDisplayPhoto("ai")}
                disabled={displayPhoto === "ai"}
              >
                {displayPhoto === "ai" ? "✓ Current Profile Photo" : "Use as Profile Photo"}
              </button>
            )}
          </div>
        </div>

        {/* AI Generation Error & Retry UI */}
        {aiSuit.error && (
          <div className="ai-error-panel">
            <p className="ai-error-message">{aiSuit.error.message}</p>
            {aiSuit.canRetry && (
              <button type="button" className="btn-secondary" onClick={aiSuit.retry}>
                Retry
              </button>
            )}
            {aiSuit.retryCount >= 3 && (
              <p className="ai-error-exhausted">Multiple attempts failed. Please try again later.</p>
            )}
            <button type="button" className="btn-text" onClick={aiSuit.clearError}>
              Dismiss
            </button>
          </div>
        )}

        {/* Cooldown Timer */}
        {aiSuit.cooldownMinutes != null && (
          <div className="ai-cooldown-panel">
            <p>Rate limit reached. Try again in {aiSuit.cooldownMinutes} minute{aiSuit.cooldownMinutes !== 1 ? 's' : ''}.</p>
          </div>
        )}

        <div ref={cameraSectionRef} className="camera-section">
          {cameraActive ? (
            <div className="camera-panel">
              <div className="camera-frame-wrap">
                <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
                <div className="camera-frame-guide" aria-hidden="true">
                  <span>Face + shoulders in frame</span>
                </div>
              </div>
              <div className="camera-controls">
                <button type="button" className="btn-primary" onClick={captureFromCamera} disabled={aiSuit.isGenerating || aiSuit.cooldownMinutes != null}>
                  Capture Profile Shot
                </button>
                <button type="button" className="btn-secondary" onClick={stopCamera}>
                  Cancel Camera
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="camera-controls">
                <button type="button" className="btn-primary" onClick={startCamera} disabled={aiSuit.isGenerating || aiSuit.cooldownMinutes != null}>
                  Open Camera
                </button>
                {hasProfilePhoto && !aiSuit.isGenerating && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={generateAiSuit}
                    disabled={aiSuit.cooldownMinutes != null}
                  >
                    {aiProfilePhoto ? "Regenerate Racing Suit" : "Generate Racing Suit"}
                  </button>
                )}
              </div>
              <div className="camera-controls">
                <label className={`btn-secondary upload-trigger${(aiSuit.isGenerating || aiSuit.cooldownMinutes != null) ? " disabled" : ""}`}>
                  Upload Image
                  <input type="file" accept="image/*" onChange={handleFileUpload} disabled={aiSuit.isGenerating || aiSuit.cooldownMinutes != null} />
                </label>
                {hasProfilePhoto && (
                  <button type="button" className="btn-secondary btn-danger" onClick={removeProfilePhoto} disabled={aiSuit.isGenerating}>
                    Remove Photo
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {cameraError && <p className="profile-error">Camera error: {cameraError}</p>}
      </div>

      <div className="card team-card">
        <h2>Favourite Team</h2>
        {askTeamAfterPhoto && (
          <p className="team-prompt">
            Great shot. Choose your favourite F1 team now so your profile theme and AI suit match
            your identity.
          </p>
        )}

        <div className="team-grid">
          {Object.entries(TEAM_THEMES).map(([teamKey, team]) => {
            const selected = favoriteTeam === teamKey;

            return (
              <button
                key={teamKey}
                type="button"
                onClick={() => handleTeamChange(teamKey)}
                className={`team-option ${selected ? "selected" : ""}`}
                disabled={aiSuit.isGenerating || aiSuit.cooldownMinutes != null}
                style={{
                  "--team-primary": team.primary,
                  "--team-secondary": team.secondary,
                  "--team-accent": team.accent,
                }}
              >
                <span>{team.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

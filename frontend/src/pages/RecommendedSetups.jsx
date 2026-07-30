/**
 * RecommendedSetups.jsx — Car Setup Database
 * ============================
 * Presents optimized car setup recommendations for each F1 25 track. Users select a
 * track from a searchable dropdown and view categorized setup parameters including
 * aerodynamics, transmission, suspension geometry, suspension, brakes, and tyres.
 */
import { useState, useEffect, useRef, useMemo } from "react";
import SetupSection from "../components/SetupSection";
import { SETUP_DATA, getAvailableTrackKeys } from "../data/setupsData";
import "./RecommendedSetups.css";

// Import the track ID to name mapping from Leaderboard
const TRACK_ID_TO_NAME = {
  0: "Melbourne",
  2: "Shanghai",
  3: "Sakhir (Bahrain)",
  4: "Catalunya",
  5: "Monaco",
  6: "Montreal",
  7: "Silverstone",
  9: "Hungaroring",
  10: "Spa",
  11: "Monza",
  12: "Singapore",
  13: "Suzuka",
  14: "Abu Dhabi",
  15: "Texas",
  16: "Brazil",
  17: "Austria",
  19: "Mexico",
  20: "Baku (Azerbaijan)",
  26: "Zandvoort",
  27: "Imola",
  29: "Jeddah",
  30: "Miami",
  31: "Las Vegas",
  32: "Losail",
  39: "Silverstone (Reverse)",
  40: "Austria (Reverse)",
  41: "Zandvoort (Reverse)",
};

export default function RecommendedSetups() {
  const availableTrackKeys = getAvailableTrackKeys();
  const [selectedTrackKey, setSelectedTrackKey] = useState(availableTrackKeys[0] || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [trackSearch, setTrackSearch] = useState("");
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Get setup data for selected track
  const setupData = selectedTrackKey ? SETUP_DATA[selectedTrackKey] : null;

  // Build track options from available setups
  const trackOptions = useMemo(() => {
    return availableTrackKeys
      .map((trackKey) => {
        const setup = SETUP_DATA[trackKey];
        return {
          trackKey,
          trackName: setup?.trackName || trackKey,
        };
      })
      .sort((a, b) => a.trackName.localeCompare(b.trackName));
  }, [availableTrackKeys]);

  // Filter tracks based on search
  const filteredTracks = useMemo(() => {
    if (!trackSearch.trim()) return trackOptions;
    const query = trackSearch.toLowerCase();
    return trackOptions.filter((t) =>
      t.trackName.toLowerCase().includes(query)
    );
  }, [trackOptions, trackSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
        setTrackSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [dropdownOpen]);

  const selectedTrackName = trackOptions.find(
    (t) => t.trackKey === selectedTrackKey
  )?.trackName || "Select Track";

  return (
    <div className="page-container" style={{ maxWidth: "960px" }}>
      <p className="page-kicker">Setup Database</p>
      <h1>
        Recommended <span className="text-primary">Setups</span>
      </h1>

      <div className="card card-tight">
        <p className="muted-copy">
          Optimized car setups for each F1 25 track. These setups are designed
          for dry conditions and provide a balanced starting point for your
          racing sessions.
        </p>
      </div>

      {/* Track Selector */}
      <div style={{ marginBottom: "24px", position: "relative", zIndex: 10 }}>
        <div className="track-select-row" ref={dropdownRef}>
          <button
            type="button"
            className="track-dropdown-trigger"
            onClick={() => {
              setDropdownOpen((prev) => !prev);
              setTrackSearch("");
            }}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            style={{ fontSize: "1.05rem", padding: "12px 16px" }}
          >
            <span>
              <strong>Track:</strong> {selectedTrackName}
            </span>
            <svg
              className="track-dropdown-chevron"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="track-dropdown-menu" role="listbox">
              <div className="track-dropdown-search-wrap">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="track-dropdown-search"
                  placeholder="Search tracks..."
                  value={trackSearch}
                  onChange={(e) => setTrackSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setDropdownOpen(false);
                      setTrackSearch("");
                    }
                  }}
                />
              </div>
              <ul className="track-dropdown-list">
                {filteredTracks.length === 0 && (
                  <li className="track-dropdown-empty">No tracks found</li>
                )}
                {filteredTracks.map((track) => {
                  const isActive = track.trackKey === selectedTrackKey;
                  return (
                    <li
                      key={track.trackKey}
                      role="option"
                      aria-selected={isActive}
                      className={
                        isActive
                          ? "track-dropdown-item active"
                          : "track-dropdown-item"
                      }
                      onClick={() => {
                        setSelectedTrackKey(track.trackKey);
                        setDropdownOpen(false);
                        setTrackSearch("");
                      }}
                    >
                      {track.trackName}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Selected Track Info */}
      {setupData && (
        <div
          className="card card-tight card-accent-blue"
          style={{ marginBottom: "24px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 6px 0", fontSize: "2rem" }}>
                {setupData.trackName}
              </h2>
              <div
                style={{
                  color: "var(--color-text-muted)",
                  fontSize: "1rem",
                  fontWeight: 600,
                }}
              >
                {setupData.setupType}
              </div>
            </div>
            <div
              style={{
                padding: "8px 16px",
                background: "rgba(0, 166, 81, 0.18)",
                border: "1px solid rgba(0, 166, 81, 0.5)",
                borderRadius: "8px",
                color: "var(--color-accent-green)",
                fontFamily: "var(--font-family-display)",
                fontSize: "1.2rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Optimized
            </div>
          </div>
        </div>
      )}

      {/* Setup Sections */}
      {setupData ? (
        <>
          <SetupSection
            title="Aerodynamics"
            settings={setupData.aerodynamics}
            delay={0}
          />
          <SetupSection
            title="Transmission"
            settings={setupData.transmission}
            delay={100}
          />
          <SetupSection
            title="Suspension Geometry"
            settings={setupData.suspensionGeometry}
            delay={200}
          />
          <SetupSection
            title="Suspension"
            settings={setupData.suspension}
            delay={300}
          />
          <SetupSection
            title="Brakes"
            settings={setupData.brakes}
            delay={400}
          />
          <SetupSection
            title="Tyres"
            settings={setupData.tyres}
            delay={500}
          />
        </>
      ) : (
        <div className="card">
          <p className="muted-copy">
            No setup data available for this track. Please select another
            track.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="card card-tight" style={{ marginTop: "24px" }}>
        <p
          className="muted-copy"
          style={{ fontSize: "0.88rem", margin: 0, textAlign: "center" }}
        >
          <strong>Note:</strong> These setups are recommendations and may require
          adjustments based on your driving style, track conditions, and personal
          preferences. Use them as a starting point for your own tuning.
        </p>
      </div>
    </div>
  );
}

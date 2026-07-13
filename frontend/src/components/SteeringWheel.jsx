function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readSteeringValue(steering) {
  const value = Number(steering);
  if (!Number.isFinite(value)) return null;
  return clamp(value, -1, 1);
}

function formatSteering(value) {
  if (value === null) return "-";
  return value.toFixed(2);
}

export default function SteeringWheel({
  steering,
  label = "Steering Wheel",
  size = 150,
  maxRotationDeg = 180,
}) {
  const value = readSteeringValue(steering);
  const safeValue = value ?? 0;
  const rotation = safeValue * maxRotationDeg;
  const absValue = Math.abs(safeValue);
  const turnLabel =
    value === null
      ? "No data"
      : absValue < 0.035
        ? "Straight"
        : safeValue < 0
          ? "Left"
          : "Right";
  const turnPercent = value === null ? "-" : Math.round(absValue * 100) + "%";
  const accent =
    value === null
      ? "#64748b"
      : absValue < 0.035
        ? "#22c55e"
        : safeValue < 0
          ? "#38bdf8"
          : "#facc15";

  return (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        alignContent: "center",
        gap: 8,
        minWidth: 0,
      }}
      aria-label={label + ": " + turnLabel}
    >
      <div
        style={{
          width: size,
          height: size,
          maxWidth: "100%",
          aspectRatio: "1 / 1",
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.12), rgba(15,23,42,0.2) 48%, rgba(0,0,0,0.24))",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,0.28)",
        }}
      >
        <svg
          viewBox="0 0 220 220"
          role="img"
          aria-label={label}
          style={{
            width: "92%",
            height: "92%",
            overflow: "visible",
          }}
        >
          <circle
            cx="110"
            cy="110"
            r="102"
            fill="rgba(2,6,23,0.7)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="4"
          />
          <circle
            cx="110"
            cy="110"
            r="72"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
            strokeDasharray="3 9"
          />
          <line
            x1="110"
            y1="13"
            x2="110"
            y2="31"
            stroke={accent}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <g
            style={{
              transform: "rotate(" + rotation + "deg)",
              transformOrigin: "110px 110px",
              transition: "transform 80ms linear",
            }}
          >
            <circle
              cx="110"
              cy="110"
              r="84"
              fill="none"
              stroke="rgba(226,232,240,0.82)"
              strokeWidth="16"
            />
            <path
              d="M42 108 C50 76 71 52 110 52 C149 52 170 76 178 108"
              fill="none"
              stroke="rgba(15,23,42,0.92)"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d="M53 147 L96 116"
              fill="none"
              stroke="rgba(226,232,240,0.78)"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <path
              d="M167 147 L124 116"
              fill="none"
              stroke="rgba(226,232,240,0.78)"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <path
              d="M110 116 L110 170"
              fill="none"
              stroke="rgba(226,232,240,0.78)"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle
              cx="110"
              cy="110"
              r="24"
              fill="rgba(15,23,42,0.95)"
              stroke={accent}
              strokeWidth="5"
            />
            <line
              x1="110"
              y1="26"
              x2="110"
              y2="48"
              stroke={accent}
              strokeWidth="8"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>

      <div style={{ textAlign: "center", minWidth: 0 }}>
        <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
          {label}
        </div>
        <div style={{ color: accent, fontSize: 18, fontWeight: 850 }}>
          {turnLabel} {turnPercent}
        </div>
        <div style={{ color: "#cbd5e1", fontSize: 12 }}>
          Input {formatSteering(value)}
        </div>
      </div>
    </div>
  );
}

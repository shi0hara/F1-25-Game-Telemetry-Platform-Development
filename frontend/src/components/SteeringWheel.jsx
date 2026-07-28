import { useEffect, useRef } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readSteeringValue(steering) {
  const value = Number(steering);
  if (!Number.isFinite(value)) return null;
  return clamp(value, -1, 1);
}

function readControlValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const fraction = Math.abs(n) > 1 ? n / 100 : n;
  return clamp(fraction, 0, 1);
}

function formatSteering(value) {
  if (value === null) return "-";
  return value.toFixed(2);
}

function formatPercent(value) {
  if (value === null) return "-";
  return Math.round(value * 100) + "%";
}

function readTelemetryControl(telemetry, pctKey, rawKey) {
  const pct = readControlValue(telemetry?.[pctKey]);
  if (pct !== null) return pct;
  return readControlValue(telemetry?.[rawKey]);
}

function getSteeringAccent(value) {
  if (value === null) return "#64748b";
  const absValue = Math.abs(value);
  if (absValue < 0.035) return "#22c55e";
  return value < 0 ? "#38bdf8" : "#facc15";
}

function getTurnLabel(value) {
  if (value === null) return "No data";
  const absValue = Math.abs(value);
  if (absValue < 0.035) return "Straight";
  return value < 0 ? "Left" : "Right";
}

function snapNear(value, target, threshold = 0.0015) {
  return Math.abs(value - target) <= threshold ? target : value;
}

function PedalBar({ label, value, color, instant = false }) {
  const controlValue = readControlValue(value);
  const percent = (controlValue ?? 0) * 100;

  return (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 5,
        minWidth: 34,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 20,
          height: 112,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: percent + "%",
            minHeight: percent > 0 ? 3 : 0,
            background: color,
            boxShadow: percent > 0 ? "0 0 16px " + color : "none",
            transition: instant ? "none" : "height 24ms linear",
            willChange: "height",
          }}
        />
      </div>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>
        {label}
      </div>
      <div style={{ color: "#e5e7eb", fontSize: 11 }}>
        {formatPercent(controlValue)}
      </div>
    </div>
  );
}

export function LiveSteeringWheel({
  telemetryRef,
  fallbackTelemetry,
  label = "Live Steering",
  size = 150,
  maxRotationDeg = 220,
}) {
  const rootRef = useRef(null);
  const wheelRef = useRef(null);
  const throttleFillRef = useRef(null);
  const brakeFillRef = useRef(null);
  const turnTextRef = useRef(null);
  const inputTextRef = useRef(null);
  const throttleTextRef = useRef(null);
  const brakeTextRef = useRef(null);
  const arrowRef = useRef(null);
  const displayRef = useRef({
    steering: 0,
    throttle: 0,
    brake: 0,
  });

  useEffect(() => {
    let frameId = 0;
    let lastFrameAt = window.performance.now();

    function updateVisuals(now) {
      const dt = Math.min(0.08, Math.max(0.001, (now - lastFrameAt) / 1000));
      lastFrameAt = now;

      const telemetry = telemetryRef?.current || fallbackTelemetry || null;
      const targetSteering = readSteeringValue(telemetry?.steering);
      const targetThrottle = readTelemetryControl(telemetry, "throttlePct", "throttle");
      const targetBrake = readTelemetryControl(telemetry, "brakePct", "brake");

      const display = displayRef.current;
      const steeringTarget = targetSteering ?? 0;
      const throttleTarget = targetThrottle ?? 0;
      const brakeTarget = targetBrake ?? 0;
      const alpha = 1 - Math.exp(-dt * 42);

      display.steering = snapNear(
        display.steering + (steeringTarget - display.steering) * alpha,
        steeringTarget
      );
      display.throttle = snapNear(
        display.throttle + (throttleTarget - display.throttle) * alpha,
        throttleTarget
      );
      display.brake = snapNear(
        display.brake + (brakeTarget - display.brake) * alpha,
        brakeTarget
      );

      const shownSteering = targetSteering === null ? null : display.steering;
      const accent = getSteeringAccent(shownSteering);
      const absValue = Math.abs(display.steering);
      const rotation = display.steering * maxRotationDeg;
      const throttlePercent = display.throttle * 100;
      const brakePercent = display.brake * 100;

      if (rootRef.current) {
        rootRef.current.style.setProperty("--steer-accent", accent);
        rootRef.current.setAttribute("aria-label", `${label}: ${getTurnLabel(shownSteering)}`);
      }
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${rotation}deg)`;
      }
      if (throttleFillRef.current) {
        throttleFillRef.current.style.height = `${throttlePercent}%`;
        throttleFillRef.current.style.minHeight = throttlePercent > 0 ? "3px" : "0";
        throttleFillRef.current.style.boxShadow =
          throttlePercent > 0 ? "0 0 16px #22c55e" : "none";
      }
      if (brakeFillRef.current) {
        brakeFillRef.current.style.height = `${brakePercent}%`;
        brakeFillRef.current.style.minHeight = brakePercent > 0 ? "3px" : "0";
        brakeFillRef.current.style.boxShadow =
          brakePercent > 0 ? "0 0 16px #f87171" : "none";
      }
      if (turnTextRef.current) {
        turnTextRef.current.textContent =
          targetSteering === null
            ? "No data -"
            : `${getTurnLabel(display.steering)} ${Math.round(absValue * 100)}%`;
      }
      if (inputTextRef.current) {
        inputTextRef.current.textContent = `Input ${formatSteering(shownSteering)}`;
      }
      if (throttleTextRef.current) {
        throttleTextRef.current.textContent = formatPercent(display.throttle);
      }
      if (brakeTextRef.current) {
        brakeTextRef.current.textContent = formatPercent(display.brake);
      }
      if (arrowRef.current) {
        arrowRef.current.style.opacity =
          targetSteering === null || absValue < 0.035 ? "0.16" : "0.95";
        arrowRef.current.style.left = display.steering < 0 ? "18px" : "auto";
        arrowRef.current.style.right = display.steering >= 0 ? "18px" : "auto";
        arrowRef.current.style.transform = display.steering < 0 ? "rotate(180deg)" : "none";
      }

      frameId = window.requestAnimationFrame(updateVisuals);
    }

    frameId = window.requestAnimationFrame(updateVisuals);
    return () => window.cancelAnimationFrame(frameId);
  }, [fallbackTelemetry, label, maxRotationDeg, telemetryRef]);

  return (
    <div
      ref={rootRef}
      style={{
        "--steer-accent": "#64748b",
        display: "grid",
        justifyItems: "center",
        alignContent: "center",
        gap: 8,
        minWidth: 0,
      }}
      aria-label={label + ": No data"}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            position: "relative",
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
            overflow: "visible",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "5%",
              left: "50%",
              width: 4,
              height: 18,
              borderRadius: 999,
              background: "var(--steer-accent)",
              transform: "translateX(-50%)",
              boxShadow: "0 0 12px var(--steer-accent)",
            }}
          />

          <div
            ref={wheelRef}
            style={{
              width: "92%",
              height: "92%",
              transform: "rotate(0deg)",
              transformOrigin: "50% 50%",
              transition: "none",
              willChange: "transform",
            }}
          >
            <svg
              viewBox="0 0 220 220"
              role="img"
              aria-label={label}
              style={{
                width: "100%",
                height: "100%",
                overflow: "visible",
                display: "block",
              }}
            >
              <circle
                cx="110"
                cy="110"
                r="102"
                fill="rgba(2,6,23,0.72)"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="4"
              />
              <circle
                cx="110"
                cy="110"
                r="84"
                fill="none"
                stroke="rgba(226,232,240,0.86)"
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
                stroke="var(--steer-accent)"
                strokeWidth="5"
              />
              <line
                x1="110"
                y1="20"
                x2="110"
                y2="52"
                stroke="var(--steer-accent)"
                strokeWidth="11"
                strokeLinecap="round"
              />
              <circle cx="110" cy="23" r="8" fill="var(--steer-accent)" />
            </svg>
          </div>

          <div
            ref={arrowRef}
            style={{
              position: "absolute",
              bottom: -9,
              right: 18,
              color: "var(--steer-accent)",
              fontSize: 28,
              lineHeight: 1,
              opacity: 0.16,
            }}
          >
            &#8250;
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <LivePedalBar
            label="THR"
            fillRef={throttleFillRef}
            valueRef={throttleTextRef}
            color="#22c55e"
          />
          <LivePedalBar
            label="BRK"
            fillRef={brakeFillRef}
            valueRef={brakeTextRef}
            color="#f87171"
          />
        </div>
      </div>

      <div style={{ textAlign: "center", minWidth: 0 }}>
        <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
          {label}
        </div>
        <div
          ref={turnTextRef}
          style={{ color: "var(--steer-accent)", fontSize: 18, fontWeight: 850 }}
        >
          No data -
        </div>
        <div ref={inputTextRef} style={{ color: "#cbd5e1", fontSize: 12 }}>
          Input -
        </div>
      </div>
    </div>
  );
}

function LivePedalBar({ label, fillRef, valueRef, color }) {
  return (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 5,
        minWidth: 34,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 20,
          height: 112,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <div
          ref={fillRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "0%",
            minHeight: 0,
            background: color,
            boxShadow: "none",
            transition: "none",
            willChange: "height",
          }}
        />
      </div>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>
        {label}
      </div>
      <div ref={valueRef} style={{ color: "#e5e7eb", fontSize: 11 }}>
        -
      </div>
    </div>
  );
}

export default function SteeringWheel({
  steering,
  throttle,
  brake,
  label = "Steering Wheel",
  size = 150,
  maxRotationDeg = 220,
  instant = false,
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            position: "relative",
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
            overflow: "visible",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "5%",
              left: "50%",
              width: 4,
              height: 18,
              borderRadius: 999,
              background: accent,
              transform: "translateX(-50%)",
              boxShadow: "0 0 12px " + accent,
            }}
          />

          <div
            style={{
              width: "92%",
              height: "92%",
              transform: "rotate(" + rotation + "deg)",
              transformOrigin: "50% 50%",
              transition: instant ? "none" : "transform 24ms linear",
              willChange: "transform",
            }}
          >
            <svg
              viewBox="0 0 220 220"
              role="img"
              aria-label={label}
              style={{
                width: "100%",
                height: "100%",
                overflow: "visible",
                display: "block",
              }}
            >
              <circle
                cx="110"
                cy="110"
                r="102"
                fill="rgba(2,6,23,0.72)"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="4"
              />
              <circle
                cx="110"
                cy="110"
                r="84"
                fill="none"
                stroke="rgba(226,232,240,0.86)"
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
                y1="20"
                x2="110"
                y2="52"
                stroke={accent}
                strokeWidth="11"
                strokeLinecap="round"
              />
              <circle cx="110" cy="23" r="8" fill={accent} />
            </svg>
          </div>

          <div
            style={{
              position: "absolute",
              bottom: -9,
              left: safeValue < 0 ? 18 : "auto",
              right: safeValue >= 0 ? 18 : "auto",
              color: accent,
              fontSize: 28,
              lineHeight: 1,
              opacity: value === null || absValue < 0.035 ? 0.16 : 0.95,
              transform: safeValue < 0 ? "rotate(180deg)" : "none",
            }}
          >
            &#8250;
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <PedalBar label="THR" value={throttle} color="#22c55e" instant={instant} />
          <PedalBar label="BRK" value={brake} color="#f87171" instant={instant} />
        </div>
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

import { useEffect, useRef, useState } from "react";

export default function SetupBar({ label, value, min, max, isInView, delay = 0 }) {
  const [animatedWidth, setAnimatedWidth] = useState(0);
  const barRef = useRef(null);
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Calculate percentage for the bar width
  const percentage = ((value - min) / (max - min)) * 100;

  useEffect(() => {
    if (isInView && !prefersReducedMotion) {
      const timer = setTimeout(() => {
        setAnimatedWidth(percentage);
      }, delay);
      return () => clearTimeout(timer);
    } else if (isInView && prefersReducedMotion) {
      setAnimatedWidth(percentage);
    }
  }, [isInView, percentage, delay, prefersReducedMotion]);

  // Format the display value
  const displayValue = typeof value === "number" && value % 1 !== 0 
    ? value.toFixed(1) 
    : value;

  return (
    <div
      ref={barRef}
      className="setup-bar-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px, 200px) 1fr minmax(60px, 80px)",
        gap: "12px",
        alignItems: "center",
        marginBottom: "14px",
      }}
    >
      <div
        className="setup-bar-label"
        style={{
          color: "var(--color-text-white)",
          fontSize: "0.95rem",
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>

      <div
        className="setup-bar-wrapper"
        style={{
          position: "relative",
          height: "20px",
          background: "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "6px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${isInView ? animatedWidth : 0}%`,
            background: "linear-gradient(90deg, #e10600, #ff2a1a)",
            borderRadius: "4px",
            transition: prefersReducedMotion ? "none" : "width 0.8s cubic-bezier(0.16, 0.8, 0.2, 1)",
            boxShadow: "0 0 8px rgba(225, 6, 0, 0.4)",
          }}
        />
      </div>

      <div
        className="setup-bar-value"
        style={{
          color: "var(--color-accent-green)",
          fontSize: "1rem",
          fontWeight: 700,
          textAlign: "right",
          fontFamily: "var(--font-family-display)",
        }}
      >
        {displayValue}
      </div>
    </div>
  );
}

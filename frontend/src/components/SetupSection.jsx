import { useEffect, useRef, useState } from "react";
import SetupBar from "./SetupBar";

export default function SetupSection({ title, settings, delay = 0 }) {
  const [isInView, setIsInView] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const sectionRef = useRef(null);
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setIsInView(true);
          setHasAnimated(true);
        }
      },
      {
        threshold: 0.2,
        rootMargin: "0px 0px -100px 0px",
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, [hasAnimated]);

  return (
    <div
      ref={sectionRef}
      className="card"
      style={{
        opacity: isInView || prefersReducedMotion ? 1 : 0,
        transform:
          isInView || prefersReducedMotion
            ? "translateY(0)"
            : "translateY(20px)",
        transition: prefersReducedMotion
          ? "none"
          : `opacity 0.6s cubic-bezier(0.16, 0.8, 0.2, 1) ${delay}ms, transform 0.6s cubic-bezier(0.16, 0.8, 0.2, 1) ${delay}ms`,
      }}
    >
      <h2 style={{ marginBottom: "20px" }}>{title}</h2>
      {Object.entries(settings).map(([key, setting], index) => (
        <SetupBar
          key={key}
          label={formatLabel(key)}
          value={setting.value}
          min={setting.min}
          max={setting.max}
          isInView={isInView}
          delay={index * 80}
        />
      ))}
    </div>
  );
}

// Convert camelCase to readable labels
function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

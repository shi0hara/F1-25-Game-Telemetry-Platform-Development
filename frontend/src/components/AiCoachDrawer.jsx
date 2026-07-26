import { useCallback, useEffect, useRef, useState } from "react";
import "./AiCoachDrawer.css";

/**
 * Side drawer for the AI Driving Coach analysis.
 *
 * Props:
 *  - open: boolean — whether the drawer is visible
 *  - onClose: () => void — called when the drawer should close
 *  - title: string — drawer heading (defaults to "AI Driving Coach")
 *  - reportContent: string|null — markdown/text content to display
 *  - triggerRef: React ref — the button that opened the drawer (focus returns here on close)
 */
export default function AiCoachDrawer({
  open,
  onClose,
  title = "AI Driving Coach",
  reportContent = null,
  triggerRef = null,
}) {
  const [mode, setMode] = useState("advanced"); // "beginner" | "advanced"
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Move focus into drawer when it opens
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  // Return focus to trigger when closing
  const handleClose = useCallback(() => {
    onClose();
    setTimeout(() => {
      if (triggerRef?.current) {
        triggerRef.current.focus();
      }
    }, 0);
  }, [onClose, triggerRef]);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  // Close on backdrop click
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  // Trap focus inside drawer
  useEffect(() => {
    if (!open || !drawerRef.current) return undefined;

    function trapFocus(e) {
      if (e.key !== "Tab") return;

      const focusable = drawerRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [open]);

  return (
    <div
      className={`ai-drawer-backdrop ${open ? "ai-drawer-backdrop--open" : ""}`}
      onClick={handleBackdropClick}
      aria-hidden={!open}
    >
      <aside
        ref={drawerRef}
        className={`ai-drawer ${open ? "ai-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="ai-drawer-header">
          <h2 className="ai-drawer-title">{title}</h2>
          <button
            ref={closeButtonRef}
            className="ai-drawer-close"
            onClick={handleClose}
            aria-label="Close drawer"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Beginner / Advanced toggle */}
        <div
          className={`ai-drawer-toggle ${mode === "advanced" ? "is-advanced" : ""}`}
        >
          <button
            className={mode === "beginner" ? "active" : ""}
            onClick={() => setMode("beginner")}
            type="button"
          >
            Beginner
          </button>
          <button
            className={mode === "advanced" ? "active" : ""}
            onClick={() => setMode("advanced")}
            type="button"
          >
            Advanced
          </button>
        </div>

        {/* Report content area */}
        <div className="ai-drawer-body">
          {reportContent ? (
            <div className="ai-drawer-report">{reportContent}</div>
          ) : (
            <p className="ai-drawer-empty">No analysis available yet.</p>
          )}
        </div>

        {/* Footer */}
        <div className="ai-drawer-footer">
          <button className="ai-drawer-confirm" onClick={handleClose}>
            Got it
          </button>
        </div>
      </aside>
    </div>
  );
}

/**
 * AiCoachDrawer.jsx — AI Driving Coach Side Panel
 * ==================================================
 * A slide-out drawer component that displays the AI coach's post-session
 * analysis. Supports two modes:
 * - Advanced: Shows the full technical telemetry analysis (pre-generated)
 * - Beginner: Generates a simplified version via the backend API on-demand
 * 
 * Features:
 * - Markdown rendering (headings, bold, italic, lists, inline code)
 * - Accessibility: focus trapping, Escape to close, ARIA modal attributes
 * - Body scroll lock when open
 * - Backdrop click to dismiss
 */

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import "./AiCoachDrawer.css";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");
  return token ? { Authorization: "Bearer " + token } : {};
}

/**
 * Lightweight markdown-to-HTML converter for AI coach responses.
 * Handles: headings, bold, italic, bullet lists, numbered lists, paragraphs.
 */
function renderMarkdown(text) {
  if (!text) return "";

  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  const html = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Close lists if line doesn't continue them
    const isBullet = /^\s*[-•*]\s+/.test(line);
    const isNumbered = /^\s*\d+[.)]\s+/.test(line);

    if (inUl && !isBullet) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl && !isNumbered) {
      html.push("</ol>");
      inOl = false;
    }

    // Headings
    if (/^#{1,4}\s+/.test(line)) {
      const level = line.match(/^(#{1,4})/)[1].length;
      const content = inlineFormat(line.replace(/^#{1,4}\s+/, ""));
      html.push(`<h${level + 2}>${content}</h${level + 2}>`);
      continue;
    }

    // Bullet list
    if (isBullet) {
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      const content = inlineFormat(line.replace(/^\s*[-•*]\s+/, ""));
      html.push(`<li>${content}</li>`);
      continue;
    }

    // Numbered list
    if (isNumbered) {
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      const content = inlineFormat(line.replace(/^\s*\d+[.)]\s+/, ""));
      html.push(`<li>${content}</li>`);
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === "") {
      html.push("<br/>");
      continue;
    }

    // Regular paragraph
    html.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inUl) html.push("</ul>");
  if (inOl) html.push("</ol>");

  return html.join("\n");
}

function inlineFormat(text) {
  // Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_ (but not inside words with underscores)
  text = text.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "<em>$1</em>");
  text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
  // Inline code: `text`
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  return text;
}

/**
 * Side drawer for the AI Driving Coach analysis.
 *
 * Props:
 *  - open: boolean — whether the drawer is visible
 *  - onClose: () => void — called when the drawer should close
 *  - title: string — drawer heading (defaults to "AI Driving Coach")
 *  - reportContent: string|null — advanced report markdown/text
 *  - sessionId: string — session ID for fetching beginner report
 *  - triggerRef: React ref — the button that opened the drawer (focus returns here on close)
 */
export default function AiCoachDrawer({
  open,
  onClose,
  title = "AI Driving Coach",
  reportContent = null,
  sessionId = null,
  triggerRef = null,
}) {
  const [mode, setMode] = useState("advanced"); // "beginner" | "advanced"
  const [beginnerContent, setBeginnerContent] = useState(null);
  const [beginnerLoading, setBeginnerLoading] = useState(false);
  const [beginnerError, setBeginnerError] = useState(null);
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

  // Generate beginner report from the backend
  const generateBeginnerReport = useCallback(async () => {
    if (!sessionId || beginnerLoading) return;
    if (beginnerContent) return; // already cached

    setBeginnerLoading(true);
    setBeginnerError(null);

    try {
      const res = await fetch(
        `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/reports/ai-coach-beginner`,
        {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            advancedContent: reportContent,
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      setBeginnerContent(data.beginnerResponse);
    } catch (err) {
      console.error("Beginner report generation failed:", err);
      setBeginnerError(err.message || "Failed to generate beginner report");
    } finally {
      setBeginnerLoading(false);
    }
  }, [sessionId, reportContent, beginnerContent, beginnerLoading]);

  // Handle confirmation button
  function handleConfirm() {
    if (mode === "beginner" && !beginnerContent && !beginnerLoading) {
      generateBeginnerReport();
      return;
    }
    handleClose();
  }

  // Determine what to display in the body
  const renderedAdvanced = useMemo(() => renderMarkdown(reportContent), [reportContent]);
  const renderedBeginner = useMemo(() => renderMarkdown(beginnerContent), [beginnerContent]);

  let bodyContent;
  if (mode === "advanced") {
    bodyContent = reportContent ? (
      <div className="ai-drawer-report" dangerouslySetInnerHTML={{ __html: renderedAdvanced }} />
    ) : (
      <p className="ai-drawer-empty">No analysis available yet.</p>
    );
  } else {
    // Beginner mode
    if (beginnerLoading) {
      bodyContent = (
        <div className="ai-drawer-loading">
          <span className="ai-drawer-loading-spinner" />
          <p>Simplifying your analysis...</p>
        </div>
      );
    } else if (beginnerError) {
      bodyContent = (
        <div className="ai-drawer-error">
          <p>{beginnerError}</p>
          <button
            className="ai-drawer-retry"
            onClick={generateBeginnerReport}
          >
            Retry
          </button>
        </div>
      );
    } else if (beginnerContent) {
      bodyContent = (
        <div className="ai-drawer-report" dangerouslySetInnerHTML={{ __html: renderedBeginner }} />
      );
    } else {
      bodyContent = (
        <p className="ai-drawer-empty">
          Click the button below to generate a beginner-friendly version of your analysis.
        </p>
      );
    }
  }

  // Confirm button label and state
  let confirmLabel = "Got it";
  let confirmDisabled = false;
  if (mode === "beginner" && !beginnerContent && !beginnerLoading) {
    confirmLabel = "Generate Beginner Report";
  } else if (mode === "beginner" && beginnerLoading) {
    confirmLabel = "Generating...";
    confirmDisabled = true;
  }

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
          {bodyContent}
        </div>

        {/* Footer */}
        <div className="ai-drawer-footer">
          <button
            className="ai-drawer-confirm"
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}

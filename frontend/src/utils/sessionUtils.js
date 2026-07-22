export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000);
  }
  if (typeof value._seconds === "number") {
    return value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1000000);
  }
  if (typeof value === "number") return value;
  if (typeof value === "object") {
    return (
      toMillis(value.iso) ||
      toMillis(value.isoString) ||
      toMillis(value.date) ||
      toMillis(value.value) ||
      toMillis(value.timestamp)
    );
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstReadableTimestamp(...values) {
  for (const value of values) {
    if (toMillis(value)) return value;
  }
  return values.find(Boolean) || null;
}

export function hasEndedAt(value) {
  if (!value) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

export function isActiveSession(session) {
  return Boolean(session) && !hasEndedAt(session.endedAt) && !hasEndedAt(session.endedAtIso);
}

export function getSessionStartedAt(session) {
  return firstReadableTimestamp(
    session?.startedAt,
    session?.startedAtIso,
    session?.createdAt,
    session?.createdAtIso,
    session?.latestTelemetryAt,
    session?.latestTelemetry?.timestamp,
    session?.latestMapPosition?.timestamp
  );
}

export function getSessionEndedAt(session) {
  return firstReadableTimestamp(
    session?.endedAt,
    session?.endedAtIso,
    session?.endedAtCorrectedAt,
    session?.endedAtCorrectedAtIso,
    session?.endedAtServerReceivedAt,
    session?.endedAtServerReceivedAtIso,
    session?.listenerClosedAt
  );
}

export function formatSessionFlag(value) {
  if (value === true || value === 1 || value === "1" || value === "true") return "Yes";
  if (value === false || value === 0 || value === "0" || value === "false") return "No";
  return "-";
}

export function getSessionFreshness(session) {
  return (
    toMillis(session?.latestMapPosition?.timestamp) ||
    toMillis(session?.latestTelemetry?.timestamp) ||
    toMillis(session?.latestTelemetryAt) ||
    toMillis(session?.updatedAt) ||
    toMillis(getSessionStartedAt(session))
  );
}

export function sortSessionsForDisplay(sessions) {
  return [...(sessions || [])].sort((a, b) => {
    const aActive = isActiveSession(a) ? 1 : 0;
    const bActive = isActiveSession(b) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return getSessionFreshness(b) - getSessionFreshness(a);
  });
}

export function latestSessionId(sessions) {
  return sortSessionsForDisplay(sessions)[0]?.id || null;
}

export function getTrackKeyFromSession(session) {
  if (session?.trackKey) return session.trackKey;
  if (session?.trackId != null) return `track_${session.trackId}`;
  return null;
}

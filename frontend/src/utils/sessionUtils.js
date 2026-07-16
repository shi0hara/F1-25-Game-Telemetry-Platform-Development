export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000);
  }
  if (typeof value._seconds === "number") {
    return value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1000000);
  }
  if (typeof value === "number") return value;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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
  return session?.startedAt || session?.startedAtIso || session?.createdAt || session?.createdAtIso || null;
}

export function getSessionEndedAt(session) {
  return session?.endedAt || session?.endedAtIso || null;
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

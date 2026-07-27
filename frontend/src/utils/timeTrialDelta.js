const INVALID_GHOST_INDEX = 255;
const LAP_RESET_THRESHOLD_METERS = 25;

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPacketCandidate(sample) {
  return sample?.packet ?? sample?.lapDataPacket ?? sample?.lapPacket ?? sample;
}

function getPacketId(packet) {
  return toFiniteNumber(packet?.m_header?.m_packetId ?? packet?.packetId);
}

function getPlayerCarIndex(packet) {
  return toFiniteNumber(
    packet?.m_header?.m_playerCarIndex ?? packet?.playerCarIndex
  );
}

function getPbGhostIndex(packet) {
  return toFiniteNumber(
    packet?.m_timeTrialPBCarIdx ?? packet?.timeTrialPBCarIdx
  );
}

function getLapData(packet) {
  return Array.isArray(packet?.m_lapData)
    ? packet.m_lapData
    : Array.isArray(packet?.lapData)
      ? packet.lapData
      : null;
}

function getLapEntry(packet, index) {
  const lapData = getLapData(packet);
  return lapData && index != null ? lapData[index] ?? null : null;
}

function getLapDistance(lapEntry) {
  return toFiniteNumber(lapEntry?.m_lapDistance ?? lapEntry?.lapDistance);
}

function getLapTimeMs(lapEntry) {
  return toFiniteNumber(
    lapEntry?.m_currentLapTimeInMS ??
      lapEntry?.currentLapTimeInMS ??
      lapEntry?.currentLapTimeMs
  );
}

function isLapDataPacket(sample) {
  const packet = getPacketCandidate(sample);
  return getPacketId(packet) === 2 ? packet : null;
}

function createTraceState() {
  return {
    trace: [],
    lastPbDistance: null,
    lastPlayerDistance: null,
  };
}

function resetTrace(state) {
  state.trace = [];
  state.lastPbDistance = null;
  state.lastPlayerDistance = null;
}

export function addPbGhostSample(state, lapPacket) {
  if (!state || !lapPacket) return state;

  const playerIndex = getPlayerCarIndex(lapPacket);
  const pbIndex = getPbGhostIndex(lapPacket);
  if (playerIndex == null || pbIndex == null || pbIndex === INVALID_GHOST_INDEX) {
    return state;
  }

  const playerLap = getLapEntry(lapPacket, playerIndex);
  const pbLap = getLapEntry(lapPacket, pbIndex);
  if (!playerLap || !pbLap) return state;

  const playerDistance = getLapDistance(playerLap);
  const pbDistance = getLapDistance(pbLap);
  const pbTimeMs = getLapTimeMs(pbLap);
  if (playerDistance == null || pbDistance == null || pbTimeMs == null) {
    return state;
  }

  const playerWrapped =
    state.lastPlayerDistance != null &&
    playerDistance + LAP_RESET_THRESHOLD_METERS < state.lastPlayerDistance;
  const pbWrapped =
    state.lastPbDistance != null &&
    pbDistance + LAP_RESET_THRESHOLD_METERS < state.lastPbDistance;

  if (playerWrapped || pbWrapped) {
    resetTrace(state);
  }

  const lastTracePoint = state.trace[state.trace.length - 1];
  const isNewPoint =
    !lastTracePoint ||
    pbDistance > lastTracePoint.distance ||
    pbTimeMs > lastTracePoint.timeMs;

  if (isNewPoint) {
    state.trace.push({ distance: pbDistance, timeMs: pbTimeMs });
  }

  state.lastPlayerDistance = playerDistance;
  state.lastPbDistance = pbDistance;
  return state;
}

export function interpolatePbTimeAtDistance(pbTrace, playerDistance) {
  if (!Array.isArray(pbTrace) || pbTrace.length === 0) return null;
  if (!Number.isFinite(playerDistance)) return null;

  if (playerDistance <= pbTrace[0].distance) {
    return pbTrace[0].timeMs;
  }

  for (let index = 1; index < pbTrace.length; index += 1) {
    const previous = pbTrace[index - 1];
    const next = pbTrace[index];

    if (playerDistance <= next.distance) {
      const distanceSpan = next.distance - previous.distance;
      if (distanceSpan <= 0) return next.timeMs;

      // Interpolation aligns player time with ghost time at the same track position.
      // Raw packet samples arrive at different distance steps, so direct time subtraction
      // between the latest player and ghost packets would jitter and misalign the delta.
      const ratio = (playerDistance - previous.distance) / distanceSpan;
      return previous.timeMs + (next.timeMs - previous.timeMs) * ratio;
    }
  }

  return pbTrace[pbTrace.length - 1].timeMs;
}

export function calculateDeltaToPB(lapPacket, pbTrace) {
  if (!lapPacket) return null;

  const playerIndex = getPlayerCarIndex(lapPacket);
  const pbIndex = getPbGhostIndex(lapPacket);
  if (playerIndex == null || pbIndex == null || pbIndex === INVALID_GHOST_INDEX) {
    return null;
  }

  const playerLap = getLapEntry(lapPacket, playerIndex);
  if (!playerLap) return null;

  const playerCurrentLapTimeMs = getLapTimeMs(playerLap);
  const playerCurrentDistance = getLapDistance(playerLap);
  const pbTimeAtPlayerCurrentDistanceMs = interpolatePbTimeAtDistance(
    pbTrace,
    playerCurrentDistance
  );

  if (
    playerCurrentLapTimeMs == null ||
    playerCurrentDistance == null ||
    pbTimeAtPlayerCurrentDistanceMs == null
  ) {
    return null;
  }

  return playerCurrentLapTimeMs - pbTimeAtPlayerCurrentDistanceMs;
}

export function formatDeltaToPB(deltaMs) {
  if (!Number.isFinite(deltaMs)) return "-";

  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "-" : "";
  return `${sign}${Math.abs(deltaMs / 1000).toFixed(3)}s`;
}

export function getLiveDeltaToPB(samples, fallbackTelemetry) {
  const state = createTraceState();
  let latestLapPacket = null;

  for (const sample of samples ?? []) {
    const lapPacket = isLapDataPacket(sample);
    if (!lapPacket) continue;

    addPbGhostSample(state, lapPacket);
    latestLapPacket = lapPacket;
  }

  const packetDeltaMs = calculateDeltaToPB(latestLapPacket, state.trace);
  if (packetDeltaMs != null) {
    return {
      deltaMs: packetDeltaMs,
      formatted: formatDeltaToPB(packetDeltaMs),
      source: "packet-trace",
    };
  }

  const fallbackDeltaMs = toFiniteNumber(fallbackTelemetry?.deltaToPB);
  return {
    deltaMs: fallbackDeltaMs,
    formatted: formatDeltaToPB(fallbackDeltaMs),
    source: fallbackDeltaMs == null ? "unavailable" : "latestTelemetry",
  };
}
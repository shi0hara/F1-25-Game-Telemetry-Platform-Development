function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

function tractionLabel(value, fallback) {
  if (fallback) return fallback;
  if (value === 0) return "Off";
  if (value === 1) return "Medium";
  if (value === 2) return "Full";
  return value == null ? "Unknown" : "Level " + value;
}

function gearboxLabel(value, assists) {
  if (assists?.gearboxAssistLabel) return assists.gearboxAssistLabel;
  if (value === 3) return "Automatic";
  if (value === 2) return "Suggested";
  if (value === 0 || value === 1) return "Manual";
  return value == null ? "Unknown" : "Mode " + value;
}

function AssistPill({ label, active, value, title }) {
  const stateClass =
    active === true ? "active" : active === false ? "off" : "unknown";

  return (
    <span className={"assist-pill " + stateClass} title={title}>
      <span className="assist-pill-label">{label}</span>
      {value && <span className="assist-pill-value">{value}</span>}
    </span>
  );
}

export default function AssistIcons({ assists }) {
  const source = assists && typeof assists === "object" ? assists : {};
  const tractionControl = numberOrNull(source.tractionControl);
  const gearboxAssist = numberOrNull(source.gearboxAssist);
  const tractionActive =
    boolOrNull(source.tractionControlActive) ??
    (tractionControl == null ? null : tractionControl > 0);
  const antiLockActive =
    boolOrNull(source.antiLockBrakesActive) ??
    boolOrNull(source.antiLockBrakes);
  const automaticGearbox =
    boolOrNull(source.automaticGearbox) ??
    (gearboxAssist == null ? null : gearboxAssist >= 3);
  const suggestedGear =
    boolOrNull(source.suggestedGear) ??
    (gearboxAssist == null ? null : gearboxAssist === 2);
  const drsAssistActive =
    boolOrNull(source.drsAssistActive) ??
    boolOrNull(source.drsAssist);

  const gearboxText = gearboxLabel(gearboxAssist, source);
  const gearboxActive = automaticGearbox === true || suggestedGear === true;

  return (
    <div className="assist-icons" aria-label="Lap assists">
      <AssistPill
        label="TC"
        active={tractionActive}
        value={tractionLabel(tractionControl, source.tractionControlLabel)}
        title={"Traction Control: " + tractionLabel(tractionControl, source.tractionControlLabel)}
      />
      <AssistPill
        label="ABS"
        active={antiLockActive}
        value={antiLockActive === null ? "Unknown" : antiLockActive ? "On" : "Off"}
        title={"Anti-lock Brakes: " + (antiLockActive === null ? "Unknown" : antiLockActive ? "On" : "Off")}
      />
      <AssistPill
        label={automaticGearbox ? "AUTO" : "MAN"}
        active={gearboxActive}
        value={gearboxText}
        title={"Gearbox: " + gearboxText}
      />
      <AssistPill
        label="DRS"
        active={drsAssistActive}
        value={drsAssistActive === null ? "Unknown" : drsAssistActive ? "Assist" : "Manual"}
        title={"DRS Assist: " + (drsAssistActive === null ? "Unknown" : drsAssistActive ? "On" : "Off")}
      />
    </div>
  );
}

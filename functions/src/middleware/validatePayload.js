/**
 * Validates the generation request payload for required fields.
 *
 * A field is considered missing/invalid if:
 * - It is undefined, null, not a string, or an empty string (after trimming)
 * - For teamColours fields, if teamColours itself is undefined/null/not-object,
 *   all three colour fields count as missing
 *
 * @param {object} body - The request body to validate
 * @returns {{ valid: true } | { valid: false, fields: string[] }}
 */
export function validateGenerationPayload(body) {
  const missingFields = [];

  if (!isNonEmptyString(body?.base64Photo)) {
    missingFields.push("base64Photo");
  }

  if (!isNonEmptyString(body?.teamKey)) {
    missingFields.push("teamKey");
  }

  const teamColours = body?.teamColours;
  const hasTeamColoursObject =
    teamColours !== undefined &&
    teamColours !== null &&
    typeof teamColours === "object";

  if (!hasTeamColoursObject || !isNonEmptyString(teamColours.primary)) {
    missingFields.push("teamColours.primary");
  }

  if (!hasTeamColoursObject || !isNonEmptyString(teamColours.secondary)) {
    missingFields.push("teamColours.secondary");
  }

  if (!hasTeamColoursObject || !isNonEmptyString(teamColours.accent)) {
    missingFields.push("teamColours.accent");
  }

  if (missingFields.length === 0) {
    return { valid: true };
  }

  return { valid: false, fields: missingFields };
}

/**
 * Checks if a value is a non-empty string (after trimming).
 *
 * @param {*} value - The value to check
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

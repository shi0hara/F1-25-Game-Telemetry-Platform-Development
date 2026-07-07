/**
 * Prompt Builder for AI Racing Suit generation.
 * Constructs the text prompt sent to the OpenRouter Image API,
 * incorporating team name, colours, and instructions to preserve
 * the user's face/head/hair while replacing torso clothing.
 */

/**
 * Mapping of team keys to their official F1 team labels.
 */
export const TEAM_THEMES = {
  "red-bull": "Red Bull Racing",
  "ferrari": "Scuderia Ferrari",
  "mercedes": "Mercedes-AMG Petronas",
  "mclaren": "McLaren F1 Team",
  "aston-martin": "Aston Martin Aramco",
  "alpine": "Alpine F1 Team",
  "williams": "Williams Racing",
  "haas": "MoneyGram Haas F1 Team",
  "kick-sauber": "Stake F1 Team Kick Sauber",
  "racing-bulls": "Visa Cash App Racing Bulls",
};

/**
 * Constructs a prompt for AI image generation of an F1 racing suit.
 *
 * @param {string} teamKey - The team identifier (e.g. "ferrari", "mercedes")
 * @param {{ primary: string, secondary: string, accent: string }} teamColours - Hex colour values for the team
 * @returns {string} The constructed prompt string for the AI model
 */
export function buildPrompt(teamKey, teamColours) {
  const teamLabel =
    TEAM_THEMES[teamKey] ||
    teamKey.charAt(0).toUpperCase() + teamKey.slice(1);

  const prompt = [
    `Generate a photorealistic F1 racing suit styled to the ${teamLabel} team on the person in this photo.`,
    `Use the team colour scheme: primary colour ${teamColours.primary}, secondary colour ${teamColours.secondary}, accent colour ${teamColours.accent}.`,
    `Keep the person's face, head, and hair completely unchanged and unmodified.`,
    `Replace only the clothing on the torso and arms with the team racing suit. Leave the background and any visible lower body unchanged.`,
    `Include team branding elements: sponsor logos area, team branding zones, and stitching lines matching the ${teamLabel} colour scheme.`,
  ].join(" ");

  return prompt;
}

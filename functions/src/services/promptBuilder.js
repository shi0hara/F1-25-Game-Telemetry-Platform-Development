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
    `Edit this photo to create an official F1 driver portrait of the person wearing a ${teamLabel} racing suit.`,
    `MOST CRITICAL INSTRUCTION: The person's FACE in the output MUST be identical to the face in the input photo (the user's photo). Do NOT use any face from the other reference images. The other reference images are ONLY for the suit design. If a reference image shows a different person, IGNORE their face entirely and ONLY copy the suit pattern from it.`,
    `Preserve the user's exact face, head, hair, skin tone, facial features, and expression from the first reference image.`,
    `POSE: Repose the person to face directly forward, looking straight at the camera, with arms relaxed at their sides. Frame as a chest-up portrait — crop at mid-chest level. Leave at least 15% empty space above the top of the head. The person's eyes should be positioned at approximately the vertical centre of the image. Ensure the ENTIRE head including all hair is fully visible within the frame.`,
    `SUIT COLOURS: Match the suit colours and colour distribution EXACTLY as shown in the suit reference images. Do NOT invent new colour placements or add colours not visible in the references.`,
    `The team colours are: ${teamColours.primary}, ${teamColours.secondary}, and ${teamColours.accent} — but use the reference images to determine exactly where each colour appears and how much of the suit each colour covers.`,
    `Replace ONLY the clothing with the team racing suit.`,
    `BACKGROUND: Keep the original background from the input photo but apply a strong Gaussian blur so it appears heavily out-of-focus. Remove any other people or figures visible in the background, filling those areas seamlessly with the surrounding blurred environment. The subject should be the only person in the final image.`,
    `Copy the exact sponsor logo placements and branding layout from the suit reference images.`,
  ].join(" ");

  return prompt;
}

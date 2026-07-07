import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = join(__dirname, "../../assets/reference-images");
const MAX_REFERENCES = 2; // Send at most 2 reference images per request

// Maps frontend team keys to reference image folder names
const FOLDER_MAP = {
  redbull: "red-bull",
  astonmartin: "aston-martin",
  racingbulls: "racing-bulls",
  kicksauber: "sauber",
};

/**
 * Loads random reference images for the given team.
 * Returns up to MAX_REFERENCES base64 data URLs.
 *
 * @param {string} teamKey - The team identifier (e.g. "ferrari", "mercedes")
 * @returns {Promise<string[]>} Array of base64 JPEG data URLs
 */
export async function getTeamReferenceImages(teamKey) {
  const folderName = FOLDER_MAP[teamKey] || teamKey;
  const teamDir = join(REFERENCE_DIR, folderName);

  let files;
  try {
    files = await readdir(teamDir);
  } catch {
    // No reference images for this team — not an error, just skip
    return [];
  }

  // Filter to image files only
  const imageFiles = files.filter((f) =>
    /\.(jpg|jpeg|png|webp)$/i.test(f)
  );

  if (imageFiles.length === 0) {
    return [];
  }

  // Pick random subset
  const selected = shuffleArray(imageFiles).slice(0, MAX_REFERENCES);

  // Read and convert to base64 data URLs
  const results = [];
  for (const file of selected) {
    try {
      const buffer = await readFile(join(teamDir, file));
      const ext = file.split(".").pop().toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      results.push(`data:${mime};base64,${buffer.toString("base64")}`);
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

/**
 * Shuffles an array in place (Fisher-Yates).
 */
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

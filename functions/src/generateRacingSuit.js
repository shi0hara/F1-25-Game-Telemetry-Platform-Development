import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./middleware/auth.js";
import { checkRateLimit } from "./middleware/rateLimiter.js";
import { validateGenerationPayload } from "./middleware/validatePayload.js";
import { preprocessImage, postprocessImage } from "./services/imageProcessor.js";
import { buildPrompt } from "./services/promptBuilder.js";
import { generateImage } from "./services/openRouterClient.js";

/**
 * Main request handler for the generateRacingSuit Cloud Function.
 * Orchestrates: auth → rate limit → validation → image processing → prompt → generation → response.
 *
 * @param {object} req - Express-style HTTP request
 * @param {object} res - Express-style HTTP response
 */
export async function handleGenerateRacingSuit(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: { code: "METHOD_NOT_ALLOWED", message: "Only POST requests are accepted." },
    });
  }

  let uid;

  try {
    // Step 1: Verify authentication
    const decodedToken = await verifyAuth(req);
    uid = decodedToken.uid;

    // Step 2: Check rate limit
    const rateLimitResult = await checkRateLimit(uid);

    if (!rateLimitResult.allowed) {
      // Log the rejected request
      await logGeneration(uid, "rejected", req.body?.teamKey || null, null);

      return res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: `Rate limit reached. Try again in ${rateLimitResult.cooldownMinutes} minutes.`,
          cooldownMinutes: rateLimitResult.cooldownMinutes,
        },
      });
    }

    // Step 3: Validate payload
    const validation = validateGenerationPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        error: {
          code: "INVALID_PAYLOAD",
          message: `Missing required fields: ${validation.fields.join(", ")}`,
          fields: validation.fields,
        },
      });
    }

    // Step 4: Preprocess the image (validate + convert to JPEG)
    const processedImage = await preprocessImage(req.body.base64Photo);

    // Step 5: Build the prompt
    const prompt = buildPrompt(req.body.teamKey, req.body.teamColours);

    // Step 6: Generate image via OpenRouter
    const rawB64 = await generateImage(prompt, processedImage);

    // Step 7: Post-process the generated image
    const finalDataUrl = await postprocessImage(rawB64);

    // Step 8: Log successful generation
    await logGeneration(uid, "forwarded", req.body.teamKey, null);

    // Step 9: Return the generated image
    return res.status(200).json({ aiImageDataUrl: finalDataUrl });
  } catch (error) {
    // Handle structured errors thrown by middleware/services
    if (error && typeof error.status === "number" && error.code && error.message) {
      return res.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
    }

    // Unexpected errors - return 500 without internal details
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  }
}

/**
 * Logs a generation request to the generationLogs Firestore collection.
 *
 * @param {string} userId - Firebase Auth UID
 * @param {"forwarded"|"rejected"} outcome - Whether the request was forwarded or rejected
 * @param {string|null} teamKey - Team key from the request
 * @param {string|null} errorCode - Error code if the request failed
 */
async function logGeneration(userId, outcome, teamKey, errorCode) {
  try {
    const db = getFirestore();
    await db.collection("generationLogs").add({
      userId,
      timestamp: FieldValue.serverTimestamp(),
      outcome,
      teamKey: teamKey || null,
      modelCost: null,
      errorCode: errorCode || null,
    });
  } catch {
    // Logging failure should not break the request flow
  }
}

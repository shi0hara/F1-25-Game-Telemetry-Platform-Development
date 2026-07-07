/**
 * OpenRouter API Client for AI image generation.
 * Sends generation requests to the OpenRouter Image API with a 90-second timeout.
 * Uses the operator's API key from environment variables.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/images";
const TIMEOUT_MS = 90000; // 90 seconds

/**
 * Generate an AI image using the OpenRouter Image API.
 *
 * @param {string} prompt - The text prompt for image generation
 * @param {string} base64Reference - Base64-encoded JPEG data URL of the reference image
 * @returns {Promise<string>} Base64-encoded generated image from the response
 * @throws {{ status: number, code: string, message: string }}
 */
export async function generateImage(prompt, base64Reference) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey) {
    throw {
      status: 502,
      code: "UPSTREAM_ERROR",
      message: "Image generation service is temporarily unavailable.",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        resolution: "1K",
        quality: "medium",
        output_format: "jpeg",
        input_references: [
          {
            type: "image_url",
            image_url: { url: base64Reference },
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 422) {
        throw {
          status: 422,
          code: "CONTENT_MODERATION",
          message: "Photo could not be processed due to content policy.",
        };
      }

      throw {
        status: 502,
        code: "UPSTREAM_ERROR",
        message: "Image generation service is temporarily unavailable.",
      };
    }

    const data = await response.json();

    // Extract the base64 image from the response
    const b64Image = data?.data?.[0]?.b64_json;
    if (!b64Image) {
      throw {
        status: 502,
        code: "UPSTREAM_ERROR",
        message: "Image generation service is temporarily unavailable.",
      };
    }

    return b64Image;
  } catch (error) {
    // Re-throw our structured errors as-is
    if (error && error.code && error.status) {
      throw error;
    }

    // Handle abort/timeout
    if (error?.name === "AbortError") {
      throw {
        status: 504,
        code: "UPSTREAM_TIMEOUT",
        message: "Image generation took too long. Please try again.",
      };
    }

    // Generic upstream error for any other failures
    throw {
      status: 502,
      code: "UPSTREAM_ERROR",
      message: "Image generation service is temporarily unavailable.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

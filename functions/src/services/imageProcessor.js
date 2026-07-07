import sharp from "sharp";

const MAX_OUTPUT_SIZE = 5 * 1024 * 1024; // 5MB
const JPEG_QUALITY = 85;
const SUPPORTED_FORMATS = ["jpeg", "png", "webp"];

/**
 * Preprocess a base64 data URL image for sending to OpenRouter.
 * Validates the image is decodable and a supported format (JPEG/PNG/WebP),
 * converts to JPEG at 85% quality, and ensures output is ≤ 5MB.
 *
 * @param {string} base64DataUrl - Base64-encoded image data URL
 * @returns {Promise<string>} Base64 JPEG data URL at 85% quality
 * @throws {{ status: number, code: string, message: string }}
 */
export async function preprocessImage(base64DataUrl) {
  if (!base64DataUrl || typeof base64DataUrl !== "string") {
    throw {
      status: 400,
      code: "INVALID_IMAGE",
      message: "The uploaded file is not a supported image format.",
    };
  }

  // Strip data URL prefix to get raw base64
  let base64Content = base64DataUrl;
  if (base64DataUrl.startsWith("data:")) {
    const commaIndex = base64DataUrl.indexOf(",");
    if (commaIndex === -1) {
      throw {
        status: 400,
        code: "INVALID_IMAGE",
        message: "The uploaded file is not a supported image format.",
      };
    }
    base64Content = base64DataUrl.slice(commaIndex + 1);
  }

  // Decode base64 to buffer
  let buffer;
  try {
    buffer = Buffer.from(base64Content, "base64");
  } catch {
    throw {
      status: 400,
      code: "INVALID_IMAGE",
      message: "The uploaded file is not a supported image format.",
    };
  }

  if (buffer.length === 0) {
    throw {
      status: 400,
      code: "INVALID_IMAGE",
      message: "The uploaded file is not a supported image format.",
    };
  }

  // Validate it's a decodable image with a supported format
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw {
      status: 400,
      code: "INVALID_IMAGE",
      message: "The uploaded file is not a supported image format.",
    };
  }

  if (!metadata.format || !SUPPORTED_FORMATS.includes(metadata.format)) {
    throw {
      status: 400,
      code: "INVALID_IMAGE",
      message: "The uploaded file is not a supported image format.",
    };
  }

  // Convert to JPEG at 85% quality
  let outputBuffer;
  try {
    outputBuffer = await sharp(buffer).jpeg({ quality: JPEG_QUALITY }).toBuffer();
  } catch {
    throw {
      status: 400,
      code: "INVALID_IMAGE",
      message: "The uploaded file is not a supported image format.",
    };
  }

  // Check output size
  if (outputBuffer.length > MAX_OUTPUT_SIZE) {
    throw {
      status: 400,
      code: "IMAGE_TOO_LARGE",
      message: "Image is too large. Please use a smaller photo.",
    };
  }

  return "data:image/jpeg;base64," + outputBuffer.toString("base64");
}

/**
 * Post-process a base64 image from OpenRouter's response.
 * Takes raw base64 (with or without data URL prefix), re-encodes as JPEG
 * at 85% quality, and returns as a data URL.
 *
 * @param {string} b64Json - Raw base64 string from OpenRouter response
 * @returns {Promise<string>} Base64 JPEG data URL at 85% quality
 */
export async function postprocessImage(b64Json) {
  if (!b64Json || typeof b64Json !== "string") {
    throw {
      status: 400,
      code: "INVALID_IMAGE",
      message: "The uploaded file is not a supported image format.",
    };
  }

  // Strip data URL prefix if present
  let base64Content = b64Json;
  if (b64Json.startsWith("data:")) {
    const commaIndex = b64Json.indexOf(",");
    if (commaIndex !== -1) {
      base64Content = b64Json.slice(commaIndex + 1);
    }
  }

  // Decode to buffer
  const buffer = Buffer.from(base64Content, "base64");

  // Re-encode as JPEG at 85% quality
  const resultBuffer = await sharp(buffer).jpeg({ quality: JPEG_QUALITY }).toBuffer();

  return "data:image/jpeg;base64," + resultBuffer.toString("base64");
}

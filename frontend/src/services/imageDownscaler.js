/**
 * Image downscaler service for persistence optimization.
 * Uses the browser Canvas API to downscale images before saving to Firestore.
 */

const MAX_DIMENSION = 720;
const JPEG_QUALITY = 0.82;

/**
 * Downscales a base64 data URL image to a maximum of 720px on the longest
 * dimension (maintaining aspect ratio) and re-encodes as JPEG at 82% quality.
 *
 * @param {string} base64DataUrl - A base64-encoded data URL (e.g. "data:image/jpeg;base64,...")
 * @returns {Promise<string>} The downscaled base64 JPEG data URL
 * @throws {Error} If the input is not a valid data URL or cannot be loaded as an image
 */
export async function downscaleForPersistence(base64DataUrl) {
  if (!base64DataUrl || typeof base64DataUrl !== "string" || !base64DataUrl.startsWith("data:")) {
    return Promise.reject(new Error("Invalid data URL: input must be a base64-encoded data URL string"));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const { width, height } = img;

        // Calculate target dimensions
        let targetWidth = width;
        let targetHeight = height;

        const longestSide = Math.max(width, height);

        if (longestSide > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / longestSide;
          targetWidth = Math.round(width * scale);
          targetHeight = Math.round(height * scale);
        }

        // Create canvas at target dimensions
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Export as JPEG at 82% quality
        const result = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to downscale image: ${err.message}`));
      }
    };

    img.onerror = () => {
      reject(new Error("Failed to load image: the provided data URL is not a valid image"));
    };

    img.src = base64DataUrl;
  });
}

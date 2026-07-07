const FUNCTIONS_URL =
  import.meta.env.VITE_FUNCTIONS_URL ||
  'http://127.0.0.1:5001/f1telementrydatabase/asia-southeast1/generateRacingSuit';

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Calls the backend proxy to generate an AI racing suit image.
 * @param {{ base64Photo: string, teamKey: string, teamColours: object, user: object }} params
 * @returns {Promise<string>} The AI-generated image as a base64 data URL
 * @throws {{ code: string, message: string, cooldownMinutes?: number }}
 */
export async function generateRacingSuit({ base64Photo, teamKey, teamColours, user }) {
  const token = await user.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ base64Photo, teamKey, teamColours }),
      signal: controller.signal,
    });

    if (response.ok) {
      const data = await response.json();
      return data.aiImageDataUrl;
    }

    // Parse error response from backend
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }

    const error = errorBody?.error || {};
    throw {
      code: error.code || `HTTP_${response.status}`,
      message: error.message || `Request failed with status ${response.status}`,
      ...(error.cooldownMinutes != null && { cooldownMinutes: error.cooldownMinutes }),
    };
  } catch (err) {
    // Re-throw already-normalized errors (from the block above)
    if (err && err.code && err.message) {
      throw err;
    }

    // Handle abort (timeout)
    if (err.name === 'AbortError') {
      throw {
        code: 'TIMEOUT',
        message: 'Request timed out. Please try again.',
      };
    }

    // Handle network errors (fetch failure)
    throw {
      code: 'NETWORK_ERROR',
      message: 'Service unavailable. Try again later.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

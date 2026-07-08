/**
 * Verifies the custom token from the request's Authorization header.
 * Attempts to decode as JWT first, falls back to using the token as a user identifier.
 * For production, add proper signature verification.
 *
 * @param {object} req - Express-style request object with headers
 * @returns {Promise<object>} Object containing uid
 * @throws {{ status: number, code: string, message: string }} On auth failure
 */
export async function verifyAuth(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw {
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    };
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw {
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    };
  }

  // Try to decode as JWT
  const parts = token.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8")
      );

      // Check expiry if present
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        throw {
          status: 401,
          code: "AUTH_FAILED",
          message: "Session expired. Please sign in again.",
        };
      }

      // Extract user identifier from common claim fields
      const uid = payload.uid || payload.sub || payload.id || payload.userId || payload.username;

      if (uid) {
        return { uid, ...payload };
      }
    } catch (error) {
      // Re-throw structured 401 errors (like expiry)
      if (error && error.status === 401) {
        throw error;
      }
      // If JWT decode fails, fall through to use token as-is
    }
  }

  // Fallback: use the token itself as the user identifier
  // This handles opaque tokens or non-standard formats
  return { uid: token };
}

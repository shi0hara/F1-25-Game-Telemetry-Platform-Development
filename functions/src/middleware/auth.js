import { getAuth } from "firebase-admin/auth";

/**
 * Verifies the Firebase ID token from the request's Authorization header.
 *
 * @param {object} req - Express-style request object with headers
 * @returns {Promise<object>} Decoded token containing uid and other claims
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

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    if (error.code === "auth/id-token-expired") {
      throw {
        status: 401,
        code: "AUTH_FAILED",
        message: "Session expired. Please sign in again.",
      };
    }

    throw {
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    };
  }
}

/**
 * auth.js — Firebase Authentication Middleware
 * ==============================================
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * The frontend sends "Bearer <id_token>" with each request to the Cloud Function.
 * 
 * If verification fails (expired token, invalid token, missing header),
 * throws a structured error that the main handler catches and returns as 401.
 */

import { getAuth } from "firebase-admin/auth";

/**
 * Verifies the Firebase Auth ID token from the Authorization header.
 *
 * @param {object} req - Express-style request object with headers
 * @returns {Promise<object>} Decoded Firebase Auth token
 * @throws {{ status: number, code: string, message: string }} On auth failure
 */
export async function verifyAuth(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw {
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    };
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    throw {
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    };
  }

  try {
    return await getAuth().verifyIdToken(token);
  } catch {
    throw {
      status: 401,
      code: "AUTH_FAILED",
      message: "Session expired or invalid. Please sign in again.",
    };
  }
}

/**
 * rateLimiter.js — Rate Limiting Middleware
 * ==========================================
 * Prevents abuse by limiting each user to 10 AI generation requests per
 * 24-hour rolling window. Uses Firestore's generationLogs collection to
 * count recent successful ("forwarded") requests.
 * 
 * If the limit is exceeded, returns a cooldown time (in minutes) indicating
 * when the oldest request will expire from the 24h window.
 * 
 * Gracefully degrades: if Firestore is unavailable, the request is allowed
 * through (fail-open) to avoid blocking users due to infrastructure issues.
 */

import { getFirestore } from "firebase-admin/firestore";

/**
 * Checks whether a user is within their rate limit for AI generation requests.
 * Enforces a maximum of 10 forwarded requests per user per 24-hour rolling window.
 *
 * @param {string} userId - The Firebase Auth UID of the requesting user
 * @returns {Promise<{allowed: boolean, cooldownMinutes?: number}>}
 *   - { allowed: true } if the user has fewer than 10 forwarded requests in the last 24 hours
 *   - { allowed: false, cooldownMinutes } if the limit is exceeded, with cooldown in whole minutes (minimum 1)
 * @throws {{ status: 503, code: string, message: string }} If Firestore is unavailable
 */
export async function checkRateLimit(userId) {
  const db = getFirestore();
  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  let snapshot;
  try {
    snapshot = await db
      .collection("generationLogs")
      .where("userId", "==", userId)
      .where("outcome", "==", "forwarded")
      .where("timestamp", ">=", twentyFourHoursAgo)
      .orderBy("timestamp", "asc")
      .get();
  } catch (error) {
    // In development/when Firestore is unavailable, allow the request through
    console.warn("Rate limiter: Firestore unavailable, allowing request:", error.message);
    return { allowed: true };
  }

  if (snapshot.docs.length < 10) {
    return { allowed: true };
  }

  // Get the oldest request's timestamp
  const oldestDoc = snapshot.docs[0];
  const oldestTimestamp = oldestDoc.data().timestamp;

  // Handle both Firestore Timestamp objects and Date objects
  const oldestMs =
    oldestTimestamp && typeof oldestTimestamp.toMillis === "function"
      ? oldestTimestamp.toMillis()
      : oldestTimestamp instanceof Date
        ? oldestTimestamp.getTime()
        : new Date(oldestTimestamp).getTime();

  // Calculate when the oldest request exits the 24h window
  const exitTimeMs = oldestMs + 24 * 60 * 60 * 1000;
  const remainingMs = exitTimeMs - now;

  // Cooldown in whole minutes (ceiling), minimum 1 minute
  const cooldownMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));

  return { allowed: false, cooldownMinutes };
}

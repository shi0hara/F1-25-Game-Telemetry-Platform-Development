/**
 * userIdentity.js — User Identity Utilities
 * ============================================
 * Simple helpers for normalising usernames and extracting user info
 * from different data shapes (string username vs user object).
 */

export function normalizeUsernameKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getUserDisplayName(userOrUsername) {
  if (typeof userOrUsername === "string") return userOrUsername;
  return userOrUsername?.username || userOrUsername?.name || "";
}

export function getUserId(userOrUsername) {
  if (!userOrUsername || typeof userOrUsername === "string") return null;
  return userOrUsername.id || userOrUsername.userId || null;
}

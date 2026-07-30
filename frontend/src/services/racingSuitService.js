/**
 * racingSuitService.js — AI Racing Suit Generation Service
 * ==========================================================
 * Handles communication with the Firebase Cloud Function that generates
 * AI racing suit images. Manages Firebase Auth token retrieval and
 * request timeout handling.
 * 
 * Flow:
 * 1. Wait for Firebase Auth to be ready (user must be signed in)
 * 2. Get a fresh Firebase ID token for authentication
 * 3. POST the photo + team info to the Cloud Function
 * 4. Return the generated image data URL or throw a structured error
 */

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

// Cloud Function URL — the Firebase function that proxies to OpenRouter
const FUNCTIONS_URL =
  import.meta.env.VITE_FUNCTIONS_URL ||
  "https://asia-southeast1-f1telementrydatabase.cloudfunctions.net/generateRacingSuit";

const REQUEST_TIMEOUT_MS = 120000; // 2 minutes — image generation can be slow
const AUTH_WAIT_MS = 5000;         // Max time to wait for Firebase Auth to initialise

/**
 * Waits for Firebase Auth to resolve the current user.
 * On app load, Firebase Auth takes a moment to restore the session.
 * This function either returns immediately if already resolved,
 * or waits up to AUTH_WAIT_MS for the auth state to settle.
 */
function waitForFirebaseUser() {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      unsubscribe();
      resolve(user || null);
    };

    const timeoutId = setTimeout(() => finish(auth.currentUser), AUTH_WAIT_MS);
    const unsubscribe = onAuthStateChanged(auth, finish);
  });
}

async function getFirebaseIdToken() {
  const user = await waitForFirebaseUser();

  if (!user) {
    throw {
      code: "AUTH_FAILED",
      message: "Please log out, log in again, then retry AI generation.",
    };
  }

  return user.getIdToken();
}

/**
 * Calls the backend proxy to generate an AI racing suit image.
 * @param {{ base64Photo: string, teamKey: string, teamColours: object }} params
 * @returns {Promise<string>} The AI-generated image as a base64 data URL
 * @throws {{ code: string, message: string, cooldownMinutes?: number }}
 */
export async function generateRacingSuit({ base64Photo, teamKey, teamColours }) {
  const token = await getFirebaseIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(FUNCTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ base64Photo, teamKey, teamColours }),
      signal: controller.signal,
    });

    if (response.ok) {
      const data = await response.json();
      return data.aiImageDataUrl;
    }

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
      ...(error.cooldownMinutes != null && {
        cooldownMinutes: error.cooldownMinutes,
      }),
    };
  } catch (err) {
    if (err && err.code && err.message) {
      throw err;
    }

    if (err.name === "AbortError") {
      throw {
        code: "TIMEOUT",
        message: "Image generation took too long. Please try again.",
      };
    }

    throw {
      code: "NETWORK_ERROR",
      message: "Service unavailable. Try again later.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

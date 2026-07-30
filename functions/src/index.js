/**
 * index.js — Firebase Cloud Functions Entry Point
 * =================================================
 * Registers all Firebase Cloud Functions for the F1 Telemetry Platform.
 * 
 * Currently exports:
 * - generateRacingSuit: AI-powered racing suit image generation function
 *   that accepts a user photo + team selection and returns an AI-generated
 *   portrait of the user in that team's F1 racing suit.
 * 
 * Configuration:
 * - Region: asia-southeast1 (Singapore, closest to target users)
 * - Memory: 512MB (needed for image processing with Sharp)
 * - Timeout: 120s (AI generation can take up to 90s)
 * - CORS: enabled (called from the frontend)
 * - Secrets: OPENROUTER_API_KEY and OPENROUTER_MODEL (stored in Secret Manager)
 */

import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { handleGenerateRacingSuit } from "./generateRacingSuit.js";

// Initialise Firebase Admin SDK (gives server-side access to Firestore, Auth, etc.)
initializeApp();

export const generateRacingSuit = onRequest(
  {
    cors: true,
    region: "asia-southeast1",
    maxInstances: 10,
    timeoutSeconds: 120,
    memory: "512MiB",
    invoker: "public",
    secrets: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"],
  },
  handleGenerateRacingSuit
);

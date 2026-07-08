import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { handleGenerateRacingSuit } from "./generateRacingSuit.js";

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

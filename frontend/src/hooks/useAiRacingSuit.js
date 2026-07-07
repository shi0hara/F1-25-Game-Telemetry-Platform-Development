import { useState, useRef, useCallback, useEffect } from "react";
import { generateRacingSuit } from "../services/racingSuitService.js";
import { auth } from "../firebase.js";

/**
 * Custom React hook for managing AI racing suit generation state.
 * Handles loading, errors, retry logic (max 3 attempts), and cooldown timers.
 *
 * @param {object} user - Firebase Auth user object (used to obtain ID tokens)
 * @returns {{
 *   isGenerating: boolean,
 *   error: { code: string, message: string } | null,
 *   cooldownMinutes: number | null,
 *   retryCount: number,
 *   canRetry: boolean,
 *   generate: (base64Photo: string, teamKey: string, teamColours: object) => Promise<string|null>,
 *   retry: () => Promise<string|null>,
 *   clearError: () => void
 * }}
 */
export function useAiRacingSuit() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [cooldownMinutes, setCooldownMinutes] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const lastRequestRef = useRef(null);
  const cooldownIntervalRef = useRef(null);

  // Clean up cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, []);

  /**
   * Start a cooldown countdown timer that decrements every 60 seconds.
   * Clears itself when the countdown reaches 0.
   */
  const startCooldownTimer = useCallback((minutes) => {
    // Clear any existing timer
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }

    setCooldownMinutes(minutes);

    cooldownIntervalRef.current = setInterval(() => {
      setCooldownMinutes((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(cooldownIntervalRef.current);
          cooldownIntervalRef.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 60000); // Decrement every 60 seconds
  }, []);

  /**
   * Sends a generation request to the backend.
   * On success, returns the AI image data URL and resets retry count.
   * On failure, sets the error state and handles cooldown if rate-limited.
   */
  const generate = useCallback(
    async (base64Photo, teamKey, teamColours) => {
      setIsGenerating(true);
      setError(null);

      // Store request params for potential retry
      lastRequestRef.current = { base64Photo, teamKey, teamColours };

      try {
        const aiImageDataUrl = await generateRacingSuit({
          base64Photo,
          teamKey,
          teamColours,
          user: auth.currentUser,
        });

        setIsGenerating(false);
        setRetryCount(0);
        return aiImageDataUrl;
      } catch (err) {
        setIsGenerating(false);
        setError({ code: err.code, message: err.message });

        // Handle rate limiting with cooldown timer
        if (err.cooldownMinutes != null && err.cooldownMinutes > 0) {
          startCooldownTimer(err.cooldownMinutes);
        }

        return null;
      }
    },
    [startCooldownTimer]
  );

  /**
   * Retries the last generation request. Increments retry count.
   * Returns null if no previous request exists or retry limit reached.
   */
  const retry = useCallback(async () => {
    if (!lastRequestRef.current || retryCount >= 3) {
      return null;
    }

    const nextRetryCount = retryCount + 1;
    setRetryCount(nextRetryCount);
    setIsGenerating(true);
    setError(null);

    const { base64Photo, teamKey, teamColours } = lastRequestRef.current;

    try {
      const aiImageDataUrl = await generateRacingSuit({
        base64Photo,
        teamKey,
        teamColours,
        user: auth.currentUser,
      });

      setIsGenerating(false);
      setRetryCount(0);
      return aiImageDataUrl;
    } catch (err) {
      setIsGenerating(false);
      setError({ code: err.code, message: err.message });

      // Handle rate limiting with cooldown timer
      if (err.cooldownMinutes != null && err.cooldownMinutes > 0) {
        startCooldownTimer(err.cooldownMinutes);
      }

      return null;
    }
  }, [retryCount, startCooldownTimer]);

  /**
   * Clears the current error state, resets retry count, and cancels any cooldown timer.
   */
  const clearError = useCallback(() => {
    setError(null);
    setRetryCount(0);
    setCooldownMinutes(null);

    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
  }, []);

  const canRetry = retryCount < 3 && error !== null && !isGenerating;

  return {
    isGenerating,
    error,
    cooldownMinutes,
    retryCount,
    canRetry,
    generate,
    retry,
    clearError,
  };
}

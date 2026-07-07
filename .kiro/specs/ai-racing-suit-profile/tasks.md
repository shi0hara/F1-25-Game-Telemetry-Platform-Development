# Implementation Plan: AI Racing Suit Profile

## Overview

This plan implements the AI-powered racing suit generation feature by building from the backend proxy outward to the frontend. We start by initializing the Firebase Cloud Functions project, implementing the backend middleware and services, then building the frontend service layer and hook, and finally wiring everything into the existing Profile.jsx component.

## Tasks

- [x] 1. Initialize Firebase Cloud Functions project and configure dependencies
  - [x] 1.1 Create the `functions/` directory at project root with `package.json` containing firebase-functions, firebase-admin, sharp (for image processing), and node-fetch dependencies
    - Initialize with `"type": "module"` for ES module support
    - Add `"engines": { "node": "20" }` for Cloud Functions Gen2
    - Add a `vitest` dev dependency for backend tests
    - Add `fast-check` dev dependency for property-based tests
    - _Requirements: 1.1, 1.4_

  - [x] 1.2 Create `functions/src/index.js` entry point that exports the `generateRacingSuit` HTTPS Cloud Function
    - Import Firebase Functions and Admin SDK
    - Initialize Firebase Admin app
    - Export the HTTP function with CORS enabled and 10MB request body limit
    - _Requirements: 1.1_

  - [x] 1.3 Update `frontend/src/firebase.js` to export Firebase Auth instance alongside Firestore
    - Add `import { getAuth } from "firebase/auth"` and export `auth`
    - This is needed for the frontend to obtain Firebase ID tokens for the backend
    - _Requirements: 1.2_

- [x] 2. Implement backend authentication and rate limiting middleware
  - [x] 2.1 Create `functions/src/middleware/auth.js` with `verifyAuth` function
    - Extract Bearer token from Authorization header
    - Verify token using `admin.auth().verifyIdToken(token)`
    - Return decoded token with `uid` on success, throw 401 error on failure
    - Handle missing, expired, and malformed token cases
    - _Requirements: 1.2, 1.3_

  - [x] 2.2 Create `functions/src/middleware/rateLimiter.js` with `checkRateLimit` function
    - Query `generationLogs` Firestore collection for user's forwarded requests within last 24 hours
    - Return `{ allowed: true }` if count < 10, else `{ allowed: false, cooldownMinutes }` 
    - Calculate cooldown as ceiling of time until oldest qualifying request exits the 24h window (minimum 1 minute)
    - Handle Firestore unavailability by returning 503 error
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 2.3 Create `functions/src/middleware/validatePayload.js` with `validateGenerationPayload` function
    - Validate presence and non-empty values for: `base64Photo`, `teamKey`, `teamColours.primary`, `teamColours.secondary`, `teamColours.accent`
    - Return 400 with list of missing/invalid field names if validation fails
    - _Requirements: 1.5, 2.6_

  - [ ]* 2.4 Write property test for payload validation (Property 1)
    - **Property 1: Payload Validation Correctness**
    - Generate random subsets of required fields including empty strings, nulls, missing keys
    - Assert: returns 400 with exactly the set of missing/invalid field names, never forwards to OpenRouter
    - **Validates: Requirements 1.5, 2.6**

  - [ ]* 2.5 Write property test for rate limiter (Property 5)
    - **Property 5: Rate Limiter Enforces Rolling Window**
    - Generate sequences of timestamps within/outside 24h windows
    - Assert: allows if < 10 forwarded in window, rejects otherwise with correct cooldown
    - **Validates: Requirements 5.1, 5.2**

- [x] 3. Implement backend image processing and prompt construction services
  - [x] 3.1 Create `functions/src/services/imageProcessor.js` with `preprocessImage` and `postprocessImage` functions
    - `preprocessImage`: Decode base64 data URL, validate it's a decodable image (JPEG/PNG/WebP), convert to JPEG at 85% quality using sharp, ensure output ≤ 5MB, return as base64 data URL
    - `postprocessImage`: Take raw base64 from OpenRouter response, wrap as JPEG data URL at 85% quality
    - Throw 400 error with descriptive message for invalid/undecodable images
    - _Requirements: 8.1, 8.2, 8.4, 8.6_

  - [x] 3.2 Create `functions/src/services/promptBuilder.js` with `buildPrompt` function
    - Accept `teamKey` and `teamColours` object
    - Construct prompt that includes: team label (from TEAM_THEMES mapping), primary/secondary/accent colours, face preservation instruction, torso-only replacement instruction, team branding elements instruction
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Create `functions/src/services/openRouterClient.js` with `generateImage` function
    - Read API key from `process.env.OPENROUTER_API_KEY` and model from `process.env.OPENROUTER_MODEL`
    - POST to `https://openrouter.ai/api/v1/images` with prompt, `input_references`, resolution "1K", quality "medium", output_format "jpeg"
    - Set 90-second timeout via AbortController
    - Handle timeout (504), content moderation (422), and generic upstream errors (502)
    - Never include API key in error responses
    - _Requirements: 1.6, 1.7, 1.8, 7.3, 8.3_

  - [ ]* 3.4 Write property test for prompt construction (Property 2)
    - **Property 2: Prompt Construction Contains All Team Information**
    - Generate random team keys from valid set, random hex colour strings
    - Assert: constructed prompt contains team label, primary, secondary, and accent colour values
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 3.5 Write property test for API key leak prevention (Property 3)
    - **Property 3: Error Response Never Leaks API Key**
    - Generate random error payloads potentially containing the API key
    - Assert: serialized error response never contains the API key or any substring > 4 chars
    - **Validates: Requirements 1.8**

  - [ ]* 3.6 Write property test for image preprocessing (Property 7)
    - **Property 7: Image Preprocessing Format Conversion**
    - Generate valid image buffers in JPEG/PNG/WebP formats plus invalid binary data
    - Assert: valid images produce "data:image/jpeg;base64," prefix, invalid inputs throw error
    - **Validates: Requirements 8.1, 8.6**

- [x] 4. Wire backend request handler and audit logging
  - [x] 4.1 Complete `functions/src/generateRacingSuit.js` request handler orchestrating the full pipeline
    - Chain: verifyAuth → checkRateLimit → validatePayload → preprocessImage → buildPrompt → generateImage → postprocessImage
    - On success: log to `generationLogs` with outcome "forwarded", return 200 with `{ aiImageDataUrl }`
    - On rate limit rejection: log with outcome "rejected", return 429
    - On errors: return appropriate status code and structured error without internal details
    - _Requirements: 1.1, 1.6, 1.7, 1.8, 5.4_

  - [x] 4.2 Create `functions/.env.example` documenting required environment variables
    - `OPENROUTER_API_KEY` - Operator's OpenRouter API key
    - `OPENROUTER_MODEL` - Model identifier (e.g. "openai/gpt-image-1")
    - _Requirements: 1.4_

- [x] 5. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement frontend service layer and file validation
  - [x] 6.1 Create `frontend/src/services/fileValidator.js` with `validateImageFile` function
    - Accept a File object, validate MIME type is one of: image/jpeg, image/png, image/webp
    - Validate file size ≤ 5MB (5 * 1024 * 1024 bytes)
    - Return `{ valid: true }` or `{ valid: false, reason: "type" | "size" }` with descriptive error message
    - _Requirements: 3.1, 3.7_

  - [x] 6.2 Create `frontend/src/services/racingSuitService.js` with `generateRacingSuit` function
    - Accept `{ base64Photo, teamKey, teamColours, user }` where `user` is the Firebase Auth user
    - Get Firebase ID token via `user.getIdToken()`
    - POST to backend endpoint with Authorization Bearer header and JSON body
    - Implement 30-second timeout via AbortController
    - Normalize errors: network (10s connection), timeout (30s), HTTP status codes → error objects with code + message
    - _Requirements: 3.1, 3.6, 7.1, 7.2_

  - [x] 6.3 Create `frontend/src/services/imageDownscaler.js` with `downscaleForPersistence` function
    - Accept a base64 data URL image
    - Downscale to max 720px on longest dimension, maintaining aspect ratio
    - Output as JPEG at 82% quality
    - Return the downscaled base64 JPEG data URL
    - _Requirements: 8.5_

  - [ ]* 6.4 Write property test for file validation (Property 4)
    - **Property 4: Frontend File Validation**
    - Generate random MIME types and file sizes across valid/invalid ranges
    - Assert: accepts valid types ≤ 5MB, rejects invalid types or oversized files with correct reason
    - **Validates: Requirements 3.1, 3.7**

  - [ ]* 6.5 Write property test for downscale constraints (Property 8)
    - **Property 8: Frontend Downscale Constraints**
    - Generate random image dimensions from 1x1 to 10000x10000
    - Assert: output max dimension ≤ 720px, aspect ratio preserved (±1px), output is JPEG data URL
    - **Validates: Requirements 8.5**

- [x] 7. Implement the useAiRacingSuit hook
  - [x] 7.1 Create `frontend/src/hooks/useAiRacingSuit.js` custom React hook
    - Manage state: `isGenerating`, `error`, `cooldownMinutes`, `retryCount`, `lastRequest` (for retry)
    - `generate(base64Photo, teamKey, teamColours)`: call racingSuitService, update state on success/failure
    - `retry()`: re-send using stored `lastRequest` params, increment retryCount
    - `canRetry`: computed as `retryCount < 3 && error !== null`
    - `clearError()`: reset error and retryCount
    - On success: reset retryCount to 0
    - On 429 response: parse cooldownMinutes, start countdown timer that decrements each minute
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.4, 7.5_

  - [ ]* 7.2 Write property test for retry counter logic (Property 6)
    - **Property 6: Retry Counter Disables After Threshold**
    - Generate sequences of success/failure outcomes
    - Assert: allows retry when count < 3, disables at ≥ 3, success resets to 0
    - **Validates: Requirements 7.5**

- [x] 8. Integrate AI generation into Profile.jsx
  - [x] 8.1 Refactor Profile.jsx to use `useAiRacingSuit` hook and `fileValidator`
    - Import and initialize `useAiRacingSuit` hook (pass Firebase Auth user)
    - Replace `buildAiOutfitImage` calls with `generate()` from the hook
    - Add file validation in `handleFileUpload` using `validateImageFile` before proceeding
    - Display validation errors for rejected files (type/size)
    - _Requirements: 3.1, 3.7, 4.1_

  - [x] 8.2 Add loading state UI to Profile.jsx
    - Show animated spinner overlay on AI Racing Suit slot when `isGenerating` is true
    - Display "Generating your racing suit (~15-30 seconds)" message
    - Disable camera, upload, and team selection controls with `disabled` attribute during generation
    - Show controls disabled within 200ms of request start, re-enable within 500ms of completion
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.3 Add error handling and retry UI to Profile.jsx
    - Display inline error messages based on error code (timeout, rate limit, upstream, content moderation)
    - Show "Retry" button when `canRetry` is true, wire to hook's `retry()` method
    - Show "Multiple attempts failed. Please try again later." when retry exhausted
    - Show cooldown timer ("Rate limit reached. Try again in X minutes.") when rate-limited
    - Disable generation trigger during cooldown, auto-re-enable when cooldown elapses
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 5.3_

  - [x] 8.4 Update persistence logic in Profile.jsx
    - After successful generation, downscale image using `downscaleForPersistence` before saving
    - Persist `profilePhoto` and `aiProfilePhoto` to Firestore and localStorage
    - On Firestore failure, fall back to localStorage and show "Saved locally. Cloud sync failed." message
    - _Requirements: 3.4, 3.8, 8.5_

  - [x] 8.5 Update team change handling in Profile.jsx
    - When team changes and profilePhoto exists, trigger new generation via the hook
    - When team changes and no profilePhoto exists, save team preference only (no generation request)
    - Retain previous AI image on regeneration failure, show error notification
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 9. Checkpoint - Frontend integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add test infrastructure and integration tests
  - [x] 10.1 Set up Vitest configuration for the frontend
    - Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, and `fast-check` as dev dependencies
    - Create `vitest.config.js` for frontend with jsdom environment
    - Add `"test": "vitest --run"` script to `frontend/package.json`
    - _Requirements: All (testing infrastructure)_

  - [x] 10.2 Set up Vitest configuration for the functions backend
    - Create `functions/vitest.config.js`
    - Add `"test": "vitest --run"` script to `functions/package.json`
    - _Requirements: All (testing infrastructure)_

  - [ ]* 10.3 Write integration test for full backend pipeline
    - Mock OpenRouter API response
    - Test full flow: auth → rate limit check → validation → image processing → prompt → generation → response
    - Verify correct Firestore `generationLogs` write on success
    - Verify 429 response with correct cooldown when rate limited
    - _Requirements: 1.1, 1.6, 1.7, 5.1, 5.4_

  - [ ]* 10.4 Write unit tests for frontend hook and service interaction
    - Mock `racingSuitService` responses
    - Test: loading state transitions, error display, retry count logic, cooldown timer
    - Test: controls disabled during generation, re-enabled on completion
    - _Requirements: 6.1, 6.3, 6.4, 7.4, 7.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses Firebase Cloud Functions Gen2 with Node 20
- The frontend uses the existing React 19 + Vite 8 setup
- Firebase Auth needs to be configured in the Firebase Console before the auth middleware will function — this is an external setup step not covered by coding tasks
- The `TEAM_THEMES` constant already exists in Profile.jsx and should be extracted to a shared location or duplicated in the backend promptBuilder with the team labels

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.2", "3.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "3.4", "3.5", "3.6", "4.1", "4.2"] },
    { "id": 3, "tasks": ["6.1", "6.2", "6.3", "10.1", "10.2"] },
    { "id": 4, "tasks": ["6.4", "6.5", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 7, "tasks": ["10.3", "10.4"] }
  ]
}
```

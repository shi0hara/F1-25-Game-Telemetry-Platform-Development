# Requirements Document

## Introduction

This feature replaces the existing canvas-based "AI Racing Suit" overlay on the F1 25 Game Telemetry Platform's Profile page with real AI-powered image generation via the OpenRouter API. When a user captures or uploads a profile photo and selects their favourite F1 team, the system calls an AI image generation model through OpenRouter to produce a realistic composite of the user wearing that team's racing suit. The platform operator provides their own OpenRouter API key, which is stored securely on the backend and used exclusively for this feature's generation requests. A secure backend proxy holds this operator-provided API key and forwards requests, while the frontend manages loading states, error feedback, and cost-aware rate limiting.

## Glossary

- **Frontend**: The React (Vite + JSX) single-page application that users interact with in their browser
- **Backend_Proxy**: A lightweight serverless function or Express endpoint that securely holds the OpenRouter API key and forwards image generation requests
- **OpenRouter_API**: The unified AI model gateway at openrouter.ai that provides access to image generation and editing models, accessed using the platform operator's own API key
- **Profile_Photo**: The original user photograph captured via camera or uploaded as a file, stored as a base64 JPEG data URL
- **AI_Racing_Suit_Image**: The AI-generated composite image showing the user wearing a realistic F1 team racing suit
- **Team_Theme**: A configuration object containing a team's label, primary colour, secondary colour, and accent colour
- **Generation_Request**: A JSON payload sent from the Frontend to the Backend_Proxy containing the base64 profile photo, team key, and team colours
- **Rate_Limiter**: A mechanism on the Backend_Proxy that restricts the number of generation requests per user per time window to control API costs

## Requirements

### Requirement 1: Backend Proxy for Secure API Access

**User Story:** As a platform operator, I want all OpenRouter API calls to route through a backend proxy, so that my own OpenRouter API key is never exposed to the client-side code.

#### Acceptance Criteria

1. THE Backend_Proxy SHALL accept POST requests at a `/api/generate-racing-suit` endpoint containing a Generation_Request payload with a maximum request body size of 10 MB
2. THE Backend_Proxy SHALL authenticate each request by verifying a Firebase ID token provided in the request Authorization header, confirming the token belongs to a registered platform user
3. IF authentication fails due to a missing, expired, or invalid token, THEN THE Backend_Proxy SHALL return a 401 status code with a structured error response indicating the authentication failure reason
4. THE Backend_Proxy SHALL store the operator-provided OpenRouter API key exclusively in server-side environment variables, ensuring it is never included in client-facing responses or frontend bundles
5. IF the Generation_Request payload is missing required fields (base64 profile photo, team key, or team colours), THEN THE Backend_Proxy SHALL return a 400 status code with a structured error response identifying the missing or invalid fields
6. IF the Generation_Request payload passes validation of all required fields (base64 profile photo, team key, and team colours), THEN THE Backend_Proxy SHALL forward the request to the OpenRouter_API with the model specified in server configuration, the prompt constructed per Requirement 2, and the base64 image data
7. WHEN the OpenRouter_API returns a successful response, THE Backend_Proxy SHALL return the generated image as a base64 data URL to the Frontend within a maximum upstream timeout of 90 seconds
8. IF the OpenRouter_API returns an error, THEN THE Backend_Proxy SHALL return a structured error response containing an error code and a human-readable message without exposing internal API details or the API key

### Requirement 2: AI Image Generation Prompt Construction

**User Story:** As a user, I want the AI to generate a realistic F1 racing suit on my photo based on my chosen team, so that my profile looks authentic to my favourite team.

#### Acceptance Criteria

1. WHEN a Generation_Request is received, THE Backend_Proxy SHALL construct a prompt that instructs the AI model to generate a photorealistic F1 racing suit onto the person in the photo, styled to the team specified in the request
2. WHEN constructing the generation prompt, THE Backend_Proxy SHALL include the team name, primary colour, secondary colour, and accent colour from the Generation_Request payload
3. WHEN constructing the generation prompt, THE Backend_Proxy SHALL instruct the AI model to preserve the person's face, head, and hair unchanged
4. WHEN constructing the generation prompt, THE Backend_Proxy SHALL instruct the AI model to replace only the clothing on the torso and arms with the team racing suit while leaving the background and any visible lower body unchanged
5. WHEN constructing the generation prompt, THE Backend_Proxy SHALL independently include team branding elements (sponsor logos area, team branding zones, and stitching lines matching the colour scheme of the chosen team) regardless of whether other prompt construction elements are present
6. IF the Generation_Request is missing any required field (base64 photo, team key, or team colours), THEN THE Backend_Proxy SHALL reject the request with a structured error response indicating which fields are missing without forwarding to the OpenRouter_API

### Requirement 3: Frontend Image Generation Flow

**User Story:** As a user, I want to see my AI racing suit photo generated after I capture or upload an image, so that I get immediate visual feedback of the result.

#### Acceptance Criteria

1. WHEN a user captures a photo from the camera or uploads an image file of type JPEG, PNG, or WebP not exceeding 5 MB in size, THE Frontend SHALL send a Generation_Request containing the image data to the Backend_Proxy
2. WHILE the Backend_Proxy is processing the Generation_Request, THE Frontend SHALL display a visible loading indicator with a text message indicating AI generation is in progress, and THE Frontend SHALL disable further capture or upload actions until processing completes or times out
3. WHEN the Backend_Proxy returns a successful AI_Racing_Suit_Image, THE Frontend SHALL display the generated image in the "AI Racing Suit" slot within 1 second of receiving the response
4. WHEN the Backend_Proxy returns a successful AI_Racing_Suit_Image, THE Frontend SHALL persist both the Profile_Photo and the AI_Racing_Suit_Image to Firebase Firestore and local storage
5. IF the Backend_Proxy returns an error response, THEN THE Frontend SHALL display an error message indicating the nature of the failure to the user and retain the original Profile_Photo without an AI overlay
6. IF the Backend_Proxy does not respond within 30 seconds of sending the Generation_Request, THEN THE Frontend SHALL abort the request, immediately hide the loading indicator, and display an error message indicating the request timed out
7. IF the user selects a file that is not of type JPEG, PNG, or WebP, or exceeds 5 MB in size, THEN THE Frontend SHALL reject the file before sending a Generation_Request and display an error message indicating the file type or size constraint that was violated
8. IF persistence to Firebase Firestore fails after successful image generation, THEN THE Frontend SHALL save the Profile_Photo and AI_Racing_Suit_Image to local storage only and display a message indicating that cloud sync failed

### Requirement 4: Team Change Regeneration

**User Story:** As a user, I want to regenerate my AI racing suit when I switch my favourite team, so that my profile always matches my current team preference.

#### Acceptance Criteria

1. WHEN a user selects a different favourite team and a Profile_Photo exists, THE Frontend SHALL send a new Generation_Request to the Backend_Proxy with the updated team key and colours, and SHALL save the team preference to Firebase Firestore and local storage regardless of generation outcome
2. WHILE the regeneration is in progress, THE Frontend SHALL display a loading indicator on the AI Racing Suit image slot and disable team selection, camera capture, and file upload controls
3. WHEN the regeneration completes successfully, THE Frontend SHALL replace the previous AI_Racing_Suit_Image with the new one and persist the update to Firebase Firestore and local storage
4. IF the regeneration fails, THEN THE Frontend SHALL retain the previous AI_Racing_Suit_Image and display an error notification that remains visible until dismissed by the user
5. WHEN a user selects a different favourite team and no Profile_Photo exists, THE Frontend SHALL save the team preference to Firebase Firestore and local storage without triggering a Generation_Request

### Requirement 5: Rate Limiting and Cost Control

**User Story:** As a platform operator, I want to limit the number of AI image generations per user, so that API costs remain manageable.

#### Acceptance Criteria

1. THE Backend_Proxy SHALL enforce a maximum of 10 successfully forwarded generation requests per user per 24-hour rolling window, where only requests that are forwarded to the AI provider count toward the limit
2. WHEN a user exceeds the rate limit, THE Backend_Proxy SHALL reject the request with a 429 status code and a message indicating the remaining cooldown time in whole minutes (minimum 1 minute)
3. IF the Frontend receives a 429 response, THEN THE Frontend SHALL display the cooldown duration from the response, disable the generation trigger, and automatically re-enable the generation trigger after the cooldown duration elapses
4. THE Backend_Proxy SHALL log each generation request (both successful and rate-limited) with the user identifier, timestamp, request outcome (forwarded or rejected), and model cost for auditing purposes
5. IF the rate-limit storage is unavailable, THEN THE Backend_Proxy SHALL reject the generation request with a 503 status code and a message indicating the service is temporarily unavailable

### Requirement 6: Loading and Progress Feedback

**User Story:** As a user, I want clear visual feedback during the AI generation process, so that I understand the system is working and have realistic expectations about wait time.

#### Acceptance Criteria

1. WHILE a generation request is in progress, THE Frontend SHALL display an animated loading spinner overlaid on the AI Racing Suit image slot, on top of any previously displayed content in that slot
2. WHILE a generation request is in progress, THE Frontend SHALL display an estimated wait time message of "Generating your racing suit (~15-30 seconds)"
3. WHILE a generation request is in progress, THE Frontend SHALL disable the camera capture, file upload, and team selection controls by setting them to a completely non-interactive state (both visually dimmed and functionally disabled) with the `disabled` attribute (or `aria-disabled="true"` combined with pointer-events removal for non-form elements) to prevent concurrent requests
4. WHEN a generation request completes or fails and the result or error message has been rendered, THE Frontend SHALL re-enable all previously disabled controls within or at 500 milliseconds
5. WHEN the user initiates a generation request, THE Frontend SHALL display the loading spinner and disable controls within 200 milliseconds of the request being sent

### Requirement 7: Error Handling and Fallback

**User Story:** As a user, I want graceful error handling when AI generation fails, so that my profile experience is not broken by transient API issues.

#### Acceptance Criteria

1. IF the Backend_Proxy is unreachable (connection fails within 10 seconds) or returns a 5xx error, THEN THE Frontend SHALL display an inline error message indicating the service is temporarily unavailable and suggesting the user try again later
2. IF the generation request times out after 60 seconds, THEN THE Frontend SHALL abort the request, display a timeout message, and re-enable controls
3. IF the AI-generated image fails content moderation by the model provider, THEN THE Backend_Proxy SHALL return a distinguishable error code separate from 5xx server errors, and THE Frontend SHALL inform the user that the photo could not be processed due to content policy restrictions
4. WHEN any generation failure occurs, THE Frontend SHALL display a "Retry" button that re-sends the Generation_Request using the existing Profile_Photo and currently selected Team_Theme without requiring the user to re-upload or re-capture
5. THE Frontend SHALL count retry attempts per generation session and disable the "Retry" button after 3 consecutive failures, displaying a message directing the user to try again later

### Requirement 8: Image Format and Quality

**User Story:** As a user, I want my AI-generated racing suit image to be high quality and consistent in format with my original photo, so that both display well on my profile.

#### Acceptance Criteria

1. WHEN the Profile_Photo is not in JPEG format, THE Backend_Proxy SHALL convert it to a base64-encoded JPEG image at a quality level of 85% before sending to the OpenRouter_API
2. THE Backend_Proxy SHALL send the Profile_Photo to the OpenRouter_API as a base64-encoded JPEG image with a maximum encoded payload size of 5 MB
3. THE Backend_Proxy SHALL request that the generated image be returned at a minimum resolution of 512x512 pixels
4. WHEN the AI_Racing_Suit_Image is received, THE Backend_Proxy SHALL convert the response to a base64 JPEG data URL at a quality level of 85% before returning to the Frontend
5. THE Frontend SHALL downscale the AI_Racing_Suit_Image to a maximum dimension of 720 pixels (maintaining aspect ratio) at a JPEG quality level of 82% before persisting to Firestore, ensuring the final base64 data URL does not exceed 1 MB
6. IF the Profile_Photo cannot be decoded as a valid image, THEN THE Backend_Proxy SHALL reject the request and return an error response indicating the uploaded file is not a supported image format

# API Reference

Base URL:

```text
https://f1-telementry-1.onrender.com
```

Local backend URL depends on the backend port configured in `server.js`.

Authenticated endpoints use:

```http
Authorization: Bearer <f1AuthToken>
```

Admin endpoints require the logged-in user to have `role: "admin"` or `isAdmin: true`.

## Health and Schema

### GET /health

Checks whether the backend is running.

Response:

```json
{ "ok": true }
```

### GET /schema

Returns Firestore collection strategy and important fields.

## Auth

### POST /auth/signup

Creates a new account.

Request:

```json
{
  "username": "test",
  "email": "test@test.com",
  "password": "test1234",
  "confirmPassword": "test1234"
}
```

Response:

```json
{
  "user": {
    "id": "userId",
    "username": "test",
    "email": "test@test.com",
    "role": "user",
    "isAdmin": false
  },
  "token": "backend-session-token",
  "firebaseToken": "firebase-custom-token"
}
```

### POST /auth/login

Logs in using username or email.

Request:

```json
{
  "identifier": "admin@admin.com",
  "password": "admin1234"
}
```

Response:

```json
{
  "token": "backend-session-token",
  "firebaseToken": "firebase-custom-token",
  "user": {
    "id": "userId",
    "username": "admin",
    "role": "admin",
    "isAdmin": true
  }
}
```

### GET /auth/me

Returns the authenticated user.

Requires auth.

### POST /auth/logout

Deletes the backend auth session.

Requires auth.

## Listener Tokens

### GET /listener-tokens

Lists active listener tokens for the logged-in user.

Requires auth.

### POST /listener-tokens

Creates a new listener token.

Requires auth.

Request:

```json
{
  "label": "My PC listener"
}
```

Response includes the token once. Copy it immediately.

### DELETE /listener-tokens/:tokenId

Revokes a token.

Requires auth.

## Admin

### GET /admin/users

Lists users.

Requires admin.

### GET /admin/users/:userId/sessions

Lists sessions belonging to one user.

Requires admin.

### PATCH /admin/users/:userId

Updates account details.

Requires admin.

Request fields:

```json
{
  "username": "newName",
  "email": "new@email.com",
  "role": "admin",
  "isSuspended": false,
  "suspendedReason": ""
}
```

### DELETE /admin/users/:userId/sessions

Deletes all sessions for one user.

Requires admin.

### DELETE /admin/users/:userId/sessions/:sessionId

Deletes one session for one user.

Requires admin.

## User Resolution

### POST /listener/resolve

Resolves a listener token to a user.

### POST /users/ensure

Ensures a user exists for listener use.

If a valid listener token is supplied, it resolves that token. Otherwise it can create or reuse a username/email based user record.

Request:

```json
{
  "username": "driver",
  "email": "driver@example.com"
}
```

### GET /users/resolve

Finds a user by username/email query parameters.

### POST /players

Legacy player/user creation endpoint.

## Sessions

### GET /users/:userId/sessions

Lists sessions for a user.

Requires auth.

### GET /sessions

Lists sessions visible to the authenticated user.

Requires auth.

Important query parameters may include:

- `username`
- `scope`
- `limit`
- admin all-session options

### POST /sessions

Creates a backend telemetry session.

Used by the listener.

Request:

```json
{
  "userId": "userId",
  "username": "driver",
  "trackId": 10,
  "trackName": "Melbourne",
  "sessionType": 12,
  "customSetup": true,
  "equalPerformance": false
}
```

### PATCH /sessions/:id

Updates session metadata.

Used by the listener to keep track/session/assist metadata fresh.

### POST /sessions/:id/end

Ends a session and triggers final post-session report generation.

Request:

```json
{
  "endedAt": "2026-07-20T12:00:00.000Z",
  "endedAtSource": "listener_detected",
  "endReason": "left_game_session",
  "endPacketType": "session_packet"
}
```

Response can include a post-session report status.

### GET /sessions/:id/reports/post-session

Fetches the compact post-session AI report.

Requires auth and readable session access.

### GET /sessions/:id/performance

Fetches session-level performance details for review pages.

Requires auth and readable session access.

Query:

- `maxSamples`: limit returned telemetry samples.

### GET /sessions/:id/live-stream

Server-sent events stream for live telemetry.

Requires auth.

Events:

- `ready`
- `telemetry`
- `ping`

## Laps

### POST /sessions/:id/laps

Creates or updates a lap document.

Used by the listener.

Request:

```json
{
  "lapNumber": 2,
  "lapTimeMs": 78042,
  "sector1Ms": 25123,
  "sector2Ms": 28500,
  "sector3Ms": 24419,
  "valid": true,
  "trackName": "Melbourne",
  "trackId": 10,
  "assists": {
    "tractionControl": 0,
    "tractionControlLabel": "Off",
    "antiLockBrakes": true,
    "gearboxAssist": 2,
    "gearboxAssistLabel": "Suggested",
    "drsAssist": false
  }
}
```

### GET /sessions/:id/laps

Returns lap timing rows.

Requires auth.

### GET /sessions/:id/laps/:lapId/performance

Returns detailed lap analysis data.

Can be used from leaderboard and session review.

Returns:

- Session summary.
- Lap summary.
- Telemetry traces.
- Sector boundaries.
- Assist snapshot.
- Map data.
- Comparison fields.

### GET /sessions/:id/lap-trails

Returns saved lap trails for the telemetry map.

Requires auth.

## Corners

### POST /sessions/:id/corners

Stores a detected braking/cornering segment.

Used by the listener.

## Telemetry Ingestion

### POST /telemetry/latest

Updates the latest live telemetry snapshot.

Used by the listener at high frequency.

Important request fields:

- `sessionId`
- `speedKph`
- `throttle`
- `brake`
- `steering`
- `rpm`
- `gear`
- `drs`
- `lapNumber`
- `currentSector`
- `lapDistance`
- `totalDistance`
- `worldX`
- `worldY`
- `worldZ`
- `assists`

### POST /telemetry/batch

Saves historical telemetry samples in chunks.

Used by the listener to avoid sending every sample as a blocking request.

Returns:

- Saved count.
- Map point count.
- Track key.
- Map bounds.

## Leaderboard

### GET /leaderboard

Returns ranked valid laps.

Query parameters:

| Parameter | Purpose |
| --- | --- |
| `trackKey` | Track filter |
| `trackId` | Track filter fallback |
| `trackName` | Track filter fallback |
| `scope` | `all`, `weekly`, or `daily` |
| `limit` | Max rows |
| `timezoneOffsetMinutes` | Weekly calendar calculation |

Response includes:

- `rows`
- `leader`
- `trackOptions`
- `scope`
- fastest sector metadata

Leaderboard rules:

- Valid laps only.
- One best real lap per user.
- Track scoped.
- Theoretical best is not used for placement.

## Track Maps and Calibration

### POST /sessions/:id/track-map/finalize

Creates/finalizes a track map from a session's recorded world positions.

Requires admin.

### GET /sessions/:id/track-map

Gets map data for one session.

Requires auth.

### GET /track-maps/:trackKey

Gets reusable track map data.

Optional query:

```text
includeCenterline=true
```

### PATCH /track-maps/:trackKey/calibration

Saves track image calibration anchors.

Requires admin.

Request:

```json
{
  "imageUrl": "/maps/albert-park.png",
  "imageWidth": 1200,
  "imageHeight": 800,
  "trackId": 10,
  "trackName": "Melbourne",
  "anchorPoints": [
    {
      "label": "T1",
      "worldX": 123.4,
      "worldZ": 456.7,
      "imageX": 512,
      "imageY": 300
    }
  ]
}
```

At least 3 anchor points are required.

## Firebase Function: generateRacingSuit

URL:

```text
https://asia-southeast1-f1telementrydatabase.cloudfunctions.net/generateRacingSuit
```

Method:

```http
POST
```

Requires Firebase Auth bearer token, not the custom backend token.

Frontend handles this by signing in with the backend-provided Firebase custom token.

Request:

```json
{
  "base64Photo": "data:image/jpeg;base64,...",
  "teamKey": "ferrari",
  "teamColours": ["#dc0000", "#ffffff"]
}
```

Response:

```json
{
  "aiImageDataUrl": "data:image/jpeg;base64,..."
}
```

Common errors:

- `METHOD_NOT_ALLOWED`: use POST.
- `AUTH_REQUIRED`: login again so Firebase Auth has a current user.
- `RATE_LIMITED`: wait for cooldown.
- `INVALID_PAYLOAD`: image/team payload missing or invalid.
- `INTERNAL_ERROR`: function/provider failure.

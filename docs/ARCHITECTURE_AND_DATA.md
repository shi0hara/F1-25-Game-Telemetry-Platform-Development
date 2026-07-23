# Architecture and Data Model

## System Overview

```text
F1 25 game
  -> UDP telemetry on port 20777
  -> Python listener revamp.py
  -> Express backend on Render
  -> Firebase Firestore
  -> React frontend

React frontend
  -> Express backend for auth, sessions, leaderboard, reports, admin, calibration
  -> Firestore realtime listeners for selected live session snapshots
  -> Firebase Cloud Function for AI racing suit generation

Firebase Cloud Function
  -> Firebase Auth verification
  -> OpenRouter image generation
```

## Frontend

Location in this repository:

```text
frontend/
```

Framework:

- React.
- Vite.
- React Router.
- Firebase Web SDK.
- Chart.js through `react-chartjs-2`.

Performance notes:

- Heavy route pages are lazy-loaded with React `lazy`/`Suspense` so dashboard/login first load does not download every analysis, live telemetry, admin, and calibration page up front.

Main routes:

| Route | Page | Access |
| --- | --- | --- |
| `/` | Dashboard | Public |
| `/login` | Login/sign up | Public when logged out |
| `/contact` | Contact | Public |
| `/live` | LiveTelemetry | Logged in |
| `/leaderboard` | Leaderboard | Public |
| `/analysis/:sessionId/lap/:lapId` | LapPerformanceAnalysis | Public route, backend data may depend on auth/session visibility |
| `/session/:sessionId` | SessionDetails | Logged in |
| `/profile` | Profile | Logged in |
| `/edit-profile` | EditProfile | Logged in |
| `/admin` | AdminUsers | Admin only |
| `/calibrate` | TrackCalibration | Admin only |

## Backend

Location:

```text
backend repository/folder containing server.js
```

The backend is the main authority for:

- Account creation.
- Password hashing.
- Login/logout sessions.
- Firebase custom token minting.
- Admin checks.
- Listener token management.
- Session creation/end.
- Telemetry ingestion.
- Lap storage.
- Leaderboard calculation.
- Track map finalization/calibration.
- Post-session AI report generation.

## Firebase Functions

Location in this repository:

```text
functions/
```

Current function:

- `generateRacingSuit`

Responsibilities:

- Verify Firebase Auth bearer token.
- Apply rate limiting.
- Validate payload.
- Resize/convert user image.
- Build team-specific prompt.
- Add reference images.
- Call OpenRouter image generation.
- Return final AI profile image.
- Log generation outcome.

## Listener

Location in this repository:

```text
revamp.py
```

Responsibilities:

- Bind to F1 25 UDP port `20777`.
- Decode F1 packet structs.
- Resolve or create driver account.
- Detect active game session start.
- Create backend session only when an actual active game session is detected.
- Read motion packets for world position.
- Read lap packets for lap number, lap distance, sector, pit status, lap timing.
- Read session history packets for official lap and sector times.
- Read car telemetry/status for speed, throttle, brake, steering, RPM, gear, DRS, assists.
- Send latest telemetry frequently.
- Batch historical telemetry samples.
- Save corners, laps, and assists.
- End backend session when the user leaves the game session or a real session end packet is detected.

## Firestore Collections

The backend schema endpoint documents these collections:

```text
users
usernames
emails
authSessions
listenerTokens
sessions
sessions/{sessionId}/telemetryChunks
sessions/{sessionId}/laps
sessions/{sessionId}/corners
sessions/{sessionId}/reports/postSession
sessions/{sessionId}/reports/postSession/laps/{lapId}
trackMaps
trackMaps/{trackKey}/centerlineChunks
generationLogs
```

## users

Stores account data.

Important fields:

| Field | Purpose |
| --- | --- |
| `username` | Display name |
| `usernameLower` | Normalized lookup key |
| `email` | Email |
| `emailLower` | Normalized email lookup key |
| `passwordHash` | Hashed password |
| `role` | `user` or `admin` |
| `isAdmin` | Boolean admin shortcut |
| `isSuspended` | Whether login should be blocked |
| `suspendedReason` | Admin-entered suspension reason |
| `createdAt` | Account creation timestamp |
| `updatedAt` | Last account update |
| `favoriteTeam` | Profile media/team preference |
| `profilePhoto` | Original profile photo |
| `aiProfilePhoto` | AI racing suit profile image |
| `displayPhoto` | Selected display image mode |

## usernames and emails

Lookup collections used to keep username/email uniqueness.

Examples:

```text
usernames/{usernameLower}
emails/{emailLower}
```

Each document points to a `userId`.

## authSessions

Stores backend login tokens.

The browser sends the token as:

```text
Authorization: Bearer <token>
```

## listenerTokens

Stores revocable listener tokens for connecting the Python listener to a user account.

Important fields:

| Field | Purpose |
| --- | --- |
| `userId` | Owner |
| `tokenId` | Public token identifier |
| `tokenHash` | Hashed secret token |
| `label` | User-facing token label |
| `createdAt` | Created time |
| `lastUsedAt` | Last successful use |
| `revokedAt` | Token revoked timestamp |

## sessions

One document per detected F1 game session.

Important fields:

| Field | Purpose |
| --- | --- |
| `userId` | Driver account |
| `username` | Driver display name |
| `trackId` | F1 track id |
| `trackName` | Human-readable track |
| `trackKey` | Stable track map key |
| `sessionType` | F1 session type id |
| `startedAt` | Server/session start timestamp |
| `startedAtIso` | ISO start timestamp fallback |
| `endedAt` | Session end timestamp |
| `endedAtIso` | ISO end timestamp fallback |
| `latestTelemetry` | Latest raw live telemetry snapshot |
| `latestTelemetryAt` | Timestamp of latest telemetry |
| `latestMapPosition` | Lightweight live map position |
| `mapSummary` | Bounds, counts, latest map position |
| `trackMap` | Finalized map from this session |
| `processedSummary` | Best lap, fastest lap, top speed, lap count |
| `customSetup` | Whether custom setup was detected |
| `equalPerformance` | Whether equal performance was detected |

Active session check:

- A session is active when it has no `endedAt` and no `endedAtIso`.

## sessions/{sessionId}/telemetryChunks

Stores historical telemetry in chunks so Firestore documents do not become too large.

Typical stored data:

- `samples` or `points`.
- Sample index.
- Speed.
- Throttle.
- Brake.
- Steering.
- RPM.
- Gear.
- DRS.
- Lap number.
- Sector.
- Lap distance.
- Total distance.
- World X/Y/Z.
- Map position.
- Assist state.

This collection is used for:

- Lap trail reconstruction.
- Session performance graph.
- Lap performance analysis.
- Post-session report generation.

## sessions/{sessionId}/laps

One document per completed lap.

Important fields:

| Field | Purpose |
| --- | --- |
| `lapNumber` | Lap number |
| `lapTimeMs` | Real lap time in milliseconds |
| `sector1Ms` | Sector 1 time |
| `sector2Ms` | Sector 2 time |
| `sector3Ms` | Sector 3 time |
| `valid` | Whether lap counts for leaderboard |
| `assists` | Assist settings snapshot |
| `trackName` | Track name |
| `trackId` | Track id |
| `recordedAt` | Backend timestamp |

Only valid real laps should be used for leaderboards.

## sessions/{sessionId}/corners

Stores detected corner/braking segments.

Used by:

- Post-session report.
- AI coaching evidence.

Fields can include:

- Start/end lap number.
- Start/end lap distance.
- Entry/min/exit speed.
- Brake distance.
- Throttle pickup timing.
- Steering metrics.
- Issue tags.

## sessions/{sessionId}/reports/postSession

Compact AI-readable coaching report.

Current schema:

```text
f1-coach-evidence-report-v5
```

Important fields:

| Field | Purpose |
| --- | --- |
| `status` | `ready` or `empty` |
| `reportPhase` | `live` or `final` |
| `dataQuality` | Confidence and telemetry coverage |
| `sessionSnapshot` | Session context |
| `bestLap` | Best actual valid lap |
| `worstLap` | Worst valid lap |
| `theoreticalBestLap` | Best valid sectors combined |
| `assistSummary` | Assist settings summary |
| `coachBrief` | Short AI-first coaching context |
| `lapComparisonTable` | Compact lap comparison |
| `precisionFindings` | Braking/cornering findings |
| `topCoachSignals` | Highest-priority coach signals |
| `aiReadableMarkdown` | Markdown formatted for AI coach |

## sessions/{sessionId}/reports/postSession/laps

Detailed per-lap report documents.

Used to avoid overloading the main report document.

Contains:

- Lap summary.
- Braking zones.
- Cornering zones.
- Apex corner analysis.
- Assist snapshot.
- Comparison to best lap.

## trackMaps

Stores reusable track map data.

Important fields:

| Field | Purpose |
| --- | --- |
| `trackKey` | Stable map id |
| `trackId` | F1 track id |
| `trackName` | Track name |
| `worldBounds` | Min/max X/Z bounds |
| `imageCalibration` | Optional image mapping anchors |
| `centerlineVersion` | Current centerline version |
| `centerlinePointCount` | Number of centerline points |
| `sourceSessionId` | Session used to build map |

## trackMaps/{trackKey}/centerlineChunks

Stores downsampled track centerline points in chunks.

The frontend loads these chunks to draw track outlines without loading a huge document.

## generationLogs

Created by the AI racing suit Cloud Function.

Used for:

- Rate-limit auditing.
- Generation outcome tracking.
- Team key tracking.

## Data Flow: Live Session

```text
F1 25 UDP packet
  -> revamp.py decodes packet
  -> local listener /live exposes newest sample to same-PC frontend
  -> session live page uses /live when active sessionId matches

F1 25 UDP packet
  -> revamp.py decodes packet
  -> latest telemetry sent to /telemetry/latest
  -> backend updates sessions/{sessionId}.latestTelemetry
  -> frontend Firestore snapshot updates live dashboard fallback/saved state

F1 25 UDP packet
  -> revamp.py batches sample
  -> backend saves /telemetry/batch to telemetryChunks
  -> map/lap/session analysis can load historical samples later
```

## Data Flow: Completed Lap

```text
Session history or lap packet
  -> revamp.py detects completed lap
  -> POST /sessions/{sessionId}/laps
  -> backend stores lap document
  -> backend updates processedSummary
  -> backend queues live post-session report update
  -> frontend lap timing and leaderboard can read the lap
```

## Data Flow: Session End

```text
F1 event/final classification/left session packet
  -> revamp.py marks session end
  -> queued samples flushed
  -> POST /sessions/{sessionId}/end
  -> backend writes endedAt/endedAtIso
  -> backend builds final post-session report
  -> session review page displays post-session details
```

## Data Flow: Leaderboard

```text
GET /leaderboard
  -> backend scans sessions/laps
  -> filters to valid plausible laps
  -> filters by track
  -> filters by all-time/weekly/daily scope
  -> keeps one best lap per user
  -> returns ranked rows and fastest sector metadata
```

## Data Quality Rules

Post-session report confidence depends on:

- Number of telemetry samples.
- Number of timed laps.
- Valid timed laps.
- Pedal coverage.
- Steering coverage.
- Lap distance coverage.
- World position availability.
- Corner event count.

If data is incomplete, the AI report should lower confidence rather than invent evidence.

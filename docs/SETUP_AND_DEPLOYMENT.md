# Setup and Deployment

This guide uses Windows PowerShell examples. Run commands from the cloned GitHub repository unless a step says to use the backend repository/folder.

## Requirements

- Node.js and npm.
- Python 3.10 or newer.
- F1 25 with UDP telemetry enabled.
- Firebase project access.
- Render access for the Express backend.
- OpenRouter API key for AI racing suit generation.

## Clone the Repository

Replace the URL with your actual GitHub repository URL:

```powershell
git clone <repo-url>
cd F1-25-Game-Telemetry-Platform-Development
```

The Express backend is maintained in the backend repository/folder that contains `server.js`.

If your backend is in a separate GitHub repository, clone that repository too and run backend commands from its root.

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Default local URL:

```text
http://localhost:5173
```

Useful scripts:

```powershell
npm run dev
npm run build
npm run preview
npm run test
npm run lint
```

Optional frontend `.env`:

```env
VITE_API_BASE=https://f1-telementry-1.onrender.com
VITE_FUNCTIONS_URL=https://asia-southeast1-f1telementrydatabase.cloudfunctions.net/generateRacingSuit
VITE_LOCAL_LISTENER_URL=http://127.0.0.1:51377
```

If `VITE_API_BASE` is wrong, login or admin calls may return HTML instead of JSON.

## Backend Setup

```powershell
cd path\to\backend
npm install
npm start
```

Useful scripts:

```powershell
npm start
npm run dev
```

The backend uses:

- Express.
- Firebase Admin.
- bcryptjs.
- helmet.
- cors.
- morgan.

Required local files/environment:

- `serviceAccountKey.json` for Firebase Admin locally.
- `.env` for any local configuration.

Do not commit service account keys or real secrets.

## Backend Deployment on Render

The backend production URL used by the frontend is:

```text
https://f1-telementry-1.onrender.com
```

Render start command should use:

```powershell
npm start
```

The backend package currently starts with:

```json
"start": "node --max-old-space-size=384 server.js"
```

The memory flag is intentional because post-session reports and telemetry processing can be memory-heavy.

After backend changes:

1. Push or upload the changed backend code to Render.
2. Wait for Render deploy to complete.
3. Test health:

```powershell
Invoke-RestMethod -Uri "https://f1-telementry-1.onrender.com/health"
```

Expected:

```text
ok = True
```

## Firebase Functions Setup

Functions live here:

```powershell
cd functions
npm install
```

Run tests:

```powershell
npm test
```

Deploy from the project root, where `firebase.json` exists:

```powershell
cd ..
npx firebase-tools deploy --only functions --project f1telementrydatabase
```

If Firebase CLI is not globally available, always use:

```powershell
npx firebase-tools <command>
```

## Firebase Function Secrets

Set OpenRouter secrets:

```powershell
npx firebase-tools functions:secrets:set OPENROUTER_API_KEY --project f1telementrydatabase
npx firebase-tools functions:secrets:set OPENROUTER_MODEL --project f1telementrydatabase
```

Then deploy functions again:

```powershell
npx firebase-tools deploy --only functions --project f1telementrydatabase
```

Do not put the same secret in both Firebase secret manager and non-secret function environment variables. That causes deploy errors like:

```text
Secret environment variable overlaps non secret environment variable
```

## Listener Setup

The listener captures UDP telemetry from F1 25.

```powershell
python .\revamp.py
```

F1 25 settings:

- UDP telemetry: On.
- UDP IP: `127.0.0.1` if listener is on the same PC.
- UDP port: `20777`.
- Broadcast mode: depends on PC/network setup, usually off for local.

The listener binds to:

```text
0.0.0.0:20777
```

The website pairing API binds locally to:

```text
127.0.0.1:51377
```

Optional listener environment variables:

| Variable | Purpose |
| --- | --- |
| `API_BASE` | Override backend URL |
| `LISTENER_CONFIG_PATH` | Override saved pairing config path |
| `LOCAL_PAIR_HOST` | Override local pairing host |
| `LOCAL_PAIR_PORT` | Override local pairing port |
| `LISTENER_RESET_CONFIG=1` | Ignore saved pairing config for one run |
| `ALLOW_MANUAL_LISTENER_LOGIN=true` | Re-enable terminal username/email prompts |

## Test Accounts

The backend contains a seed script:

```powershell
cd path\to\backend
node seed-test-users.mjs
```

Common test users:

- `test`, `test@test.com`, `test1234`
- `admin`, `admin@admin.com`, `admin1234`

Use these only for development/demo environments.

## Firestore Rules

Development rules may allow broad read/write access while debugging.

For a final or production-like deployment:

- User data should be readable by the owner and admins only.
- Sessions should be readable by the owner and admins, except leaderboard lap summaries if intentionally public.
- Track maps can usually be public read.
- Admin mutations should be backend-only or guarded by admin claims/roles.

The backend already performs role checks for protected API actions, but Firestore rules should still protect direct frontend reads.

## Verification Checklist

After deployment, test:

1. `GET /health` returns `{ ok: true }`.
2. Sign up works.
3. Login works and returns backend token plus Firebase custom token.
4. Profile loads.
5. Listener starts and creates a session when F1 enters an active game session.
6. Live telemetry updates speed and map position.
7. Completed laps appear in live timing.
8. Session end writes `endedAt` and creates a post-session report.
9. Leaderboard all-time/weekly/daily show track-scoped valid laps.
10. Admin account can access `/admin` and `/calibrate`.
11. Normal account cannot access `/admin` or `/calibrate`.
12. AI racing suit function returns an image for an authenticated user.

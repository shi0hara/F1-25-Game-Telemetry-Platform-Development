# Troubleshooting

This guide lists common problems and the fastest checks.

## Login says: Unexpected token '<', '<!DOCTYPE ...' is not valid JSON

Meaning:

- The frontend expected JSON but received an HTML page.

Most common causes:

- `VITE_API_BASE` points to the frontend site instead of the backend.
- Render backend route is missing because backend was not deployed.
- API path is wrong.

Check:

```powershell
Invoke-RestMethod -Uri "https://f1-telementry-1.onrender.com/health"
```

Expected:

```text
ok = True
```

Check login directly:

```powershell
Invoke-RestMethod -Uri "https://f1-telementry-1.onrender.com/auth/login" -Method Post -ContentType "application/json" -Body '{"identifier":"admin@admin.com","password":"admin1234"}'
```

## Backend route returns 404

Meaning:

- Render is running an older backend version.
- The route exists locally but not in deployed server.

Fix:

- Redeploy the backend.
- Confirm the deployed `server.js` contains the endpoint.
- Test `/schema` to see what the deployed backend currently supports.

## Firebase: auth/configuration-not-found

Meaning:

- Firebase Auth is not configured for the Firebase project.
- The frontend is trying to sign in with a Firebase custom token but Firebase Auth is not enabled.

Fix:

1. Open Firebase Console.
2. Go to Authentication.
3. Enable an auth provider or initialize Authentication.
4. Retry login.

## AI racing suit says authentication required

Meaning:

- The Cloud Function requires Firebase Auth.
- The custom backend token is not enough by itself.
- The frontend must also sign into Firebase Auth using `firebaseToken`.

Check:

- Backend `/auth/login` response includes `firebaseToken`.
- Frontend `Login.jsx` calls `signInWithCustomToken`.
- Browser local storage has `f1AuthToken`.
- Firebase Auth current user exists after login.

Fix:

- Log out and log in again.
- Redeploy backend if it does not return `firebaseToken`.

## AI racing suit says service unavailable

Common causes:

- Firebase Function not deployed.
- OpenRouter secret missing.
- OpenRouter model secret missing.
- OpenRouter provider error.
- Function URL incorrect.
- Function rate limit reached.

Test method:

```powershell
curl.exe -i https://asia-southeast1-f1telementrydatabase.cloudfunctions.net/generateRacingSuit
```

Expected for GET:

```text
405 Method Not Allowed
Only POST requests are accepted.
```

That means the function exists. If the frontend still fails, check auth and provider secrets.

## Firebase CLI: firebase is not recognized

Use `npx`:

```powershell
npx firebase-tools --version
```

Deploy:

```powershell
cd path\to\F1-25-Game-Telemetry-Platform-Development
npx firebase-tools deploy --only functions --project f1telementrydatabase
```

## Firebase CLI: No currently active project

Add `--project` to the same command:

```powershell
npx firebase-tools functions:secrets:set OPENROUTER_API_KEY --project f1telementrydatabase
```

Do not run `--project f1telementrydatabase` by itself. It is an option for a command, not a command.

## Firebase deploy: Not in a Firebase app directory

You are probably inside `functions/`.

Run deploy from the project root where `firebase.json` exists:

```powershell
cd path\to\F1-25-Game-Telemetry-Platform-Development
npx firebase-tools deploy --only functions --project f1telementrydatabase
```

## Firebase deploy: Secret environment variable overlaps non secret environment variable

Meaning:

- The same name exists as both a secret and a normal environment variable.

Example:

```text
OPENROUTER_API_KEY
```

Fix:

- Remove it from `.env` or normal function env config.
- Keep it only as a Firebase Functions secret.
- Redeploy.

## Render backend out of memory

Error:

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

Likely causes:

- Backend tried to process too many telemetry chunks/samples.
- Report generation repeatedly processed already-ended sessions.
- One Firestore document became too large.

Current mitigations:

- Backend start uses `--max-old-space-size=384`.
- Report generation caps samples, laps, findings, markdown size, and lap detail docs.
- Main report is compact.
- Detailed lap report data is stored in a subcollection.

If it happens again:

- Lower `POST_SESSION_MAX_TOTAL_SAMPLES`.
- Lower `POST_SESSION_MAX_SAMPLES_PER_LAP`.
- Lower `POST_SESSION_FINAL_ANALYZED_LAPS`.
- Check that ended sessions are not being repeatedly re-ended.

## Live telemetry feels delayed or catches up slowly

Likely causes:

- Frontend is reading old samples instead of latest snapshot.
- Firestore snapshot receives stale data after a newer point.
- Listener queue is backlogged.
- Backend/Firestore network latency.

Current behavior:

- Live stats use session `latestTelemetry`.
- Freshness checks reject older telemetry.
- Speed trace rejects unreasonable temporary spikes.
- Latest queue drops old pending latest updates and keeps the newest.

Check:

- Listener console for API retry errors.
- Backend Render logs for slow requests.
- Firestore session document `latestTelemetryAt`.

## Telemetry map does not show the car or trail

Likely causes:

- Motion packet 0 is not arriving.
- `worldX/worldZ` are missing.
- Session has no telemetry chunks with map points.
- Track map endpoint requires auth and token is missing.

Check listener console for:

```text
Map warning: telemetry is arriving, but no Motion packet 0 has arrived yet.
```

Check backend batch response:

```text
mapPointCount
```

If `mapPointCount` is 0, fix UDP/Motion packet input first.

## Lap trail blinks or disappears

Likely causes:

- Saved trail refresh overwrote current live trail.
- Switching sessions while old load requests are still running.
- Current lap and saved lap selection are out of sync.

Current mitigations:

- Load sequence guards ignore stale map/lap requests.
- Saved lap trails merge with live trail state.
- Current lap trail is not cleared aggressively on every lap change.

If it still happens:

- Check browser console.
- Confirm the selected session id is stable.
- Confirm `/sessions/:id/lap-trails` returns points.

## Leaderboard weekly/daily looks wrong

The leaderboard scopes use activity timestamps.

Relevant timestamps:

- Lap recorded/completed time.
- Session ended time.
- Latest telemetry time.
- Session updated time.
- Session started time.

Weekly scope:

- Starts Monday 00:00.
- Ends at current time.

Daily scope:

- Uses the current daily window implemented by the backend.

If no laps appear:

- Make sure the selected track has valid laps in that time window.
- Make sure the track selector still has track options.
- Make sure sessions have start/end/latest timestamps.
- Test all-time first, then weekly/daily.

## Session start/end date missing

Start time should be written when `/sessions` creates the session.

End time should be written when `/sessions/:id/end` is called.

Check:

- Listener actually detected an active game session.
- Listener ended the session through a real end event/left session.
- Backend saved `startedAt`, `startedAtIso`, `endedAt`, and `endedAtIso`.

Pausing should not end the session.

## RPM is always zero

Possible causes:

- Listener packet field name changed.
- F1 25 packet library exposes RPM under a different property.
- Backend/frontend reads a different field name than the listener sends.

The backend accepts several RPM field aliases:

- `rpm`
- `engineRPM`
- `engineRpm`
- `engine_rpm`
- `m_engineRPM`
- `m_engineRpm`
- `m_engine_rpm`

Check the listener sample body to confirm one of these fields is non-zero.

## Post-session details fail to load

Possible causes:

- Backend `/sessions/:id/performance` failed.
- Auth token missing.
- Session belongs to another user and current user is not admin.
- Post-session report does not exist yet.
- Firestore rules block fallback reads.

Fix:

- Log in again.
- Check backend logs.
- Test the performance endpoint with the same token.
- For old sessions, regenerate or end the session through the backend if needed.

## Post-session AI report missing assists

Assist reporting requires new listener/backend data.

For older sessions:

- Lap documents may not have `assists`.
- Telemetry chunks may not have `assists`.
- The report cannot infer settings reliably.

For new sessions:

- Ensure the latest listener is running.
- Ensure backend has report schema `f1-coach-evidence-report-v5`.
- End the session or complete laps so the report is generated.

## Normal user can see too many sessions

Expected:

- Normal users should see their own sessions.
- Admins may toggle broader visibility.

Check:

- Frontend `currentUser.role` and `isAdmin`.
- Backend `requireReadableSession`.
- Firestore rules if direct client reads are involved.

## Admin cannot see calibration/admin pages

Check the user document:

```json
{
  "role": "admin",
  "isAdmin": true
}
```

Then log out and log in again so the frontend local user object refreshes.

## Good Reset Sequence for Debugging

Use this when the app feels confused:

1. Stop listener.
2. Refresh frontend.
3. Log out.
4. Log in again.
5. Start listener.
6. Start an actual F1 25 session.
7. Complete one valid lap.
8. Leave the F1 session.
9. Check session details and leaderboard.

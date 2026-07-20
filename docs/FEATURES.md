# Feature Guide

This document explains what each user-facing feature does, who can use it, and what data it depends on.

## Account System

The app uses a custom backend account system and also signs the browser into Firebase Auth with a custom Firebase token.

Sign up requires:

- Name or username.
- Email.
- Password.
- Confirm password.

Login accepts:

- Name or email.
- Password.

The backend hashes passwords before saving accounts. The frontend stores:

- `f1User`: the logged-in user object.
- `f1AuthToken`: custom backend session token.
- `f1_username`: legacy username fallback.

User roles:

- `user`: normal driver account.
- `admin`: account with admin dashboard and track calibration access.

Suspended users cannot log in successfully.

## Admin Dashboard

Route: `/admin`

Admin-only features:

- View all accounts.
- Edit username and email.
- Change role between `user` and `admin`.
- Suspend or unsuspend users.
- Add a suspension reason.
- View a user's sessions.
- Delete one session.
- Delete all sessions for one user.

Safety behavior:

- Admins cannot remove their own admin role.
- Admins cannot suspend their own account.

## Listener Tokens

Listener tokens connect the local telemetry listener to a user account without giving the listener a password.

The profile page includes a listener token panel where users can:

- Generate a token.
- Copy the new token.
- View active listener tokens.
- Revoke old tokens.

The listener can still create or resolve a user using username/email, but token-based identity is safer for shared systems because passwords are not entered into the listener.

## Website Listener Pairing

The listener can stay running in the background while the website controls which account it records under.

Flow:

1. Start `revamp.py`.
2. The listener opens a local-only pairing API at `http://127.0.0.1:51377`.
3. User logs in on the website.
4. The website checks whether the local listener is running.
5. If it is running, the website creates a listener token and sends it to the local listener.
6. The listener resolves the token with the backend and records under that logged-in account.
7. If the user logs out, the website tells the listener to unpair.
8. If another user logs in, the website pairs the listener to the new account.

The website still cannot receive F1 UDP telemetry directly. The local listener remains required because browsers cannot bind to the game's UDP telemetry port.

## Live Telemetry

Route: `/live`

Live telemetry shows the selected session in real time.

Main live values:

- Speed.
- Throttle.
- Brake.
- Steering.
- RPM.
- Gear.
- DRS status.
- Lap number.
- Sector.
- Lap distance.
- World position.
- Assist settings.

Live session list behavior:

- The active/latest session is tinted and sorted near the top.
- Normal users see their own sessions.
- Admins can toggle between their own sessions and all sessions.

The frontend listens directly to the session document for the newest telemetry snapshot and uses backend endpoints for heavier historical data.

## Telemetry Map

Used in:

- Live telemetry.
- Session details.
- Lap performance analysis.

The map displays:

- Current car position.
- Current lap trail.
- Completed lap trails.
- Stored historical lap trails.
- Track centerline.
- Optional calibrated track image.

Lap trail behavior:

- The trail resets when a lap is completed.
- Each completed lap is saved as its own trail.
- Users can switch between current lap and saved lap trails.
- Teleport-like jumps, such as moving from pit to track, are filtered where possible.

Track coloring:

- Braking-heavy samples appear more red.
- Throttle-heavy samples appear more green.
- Steering-heavy samples appear more blue/purple.

## Telemetry Chart

Used in:

- Live telemetry lap timing.
- Session details.
- Lap performance analysis.

The chart supports:

- Lap tabs.
- Sector timing.
- Best sector highlighting.
- Valid/invalid lap indicators.
- Assist icons beside validity.
- Graph visibility toggles for multiple metrics.

Lap performance graph metrics:

- Speed.
- Throttle.
- Brake.
- RPM.
- Gear.
- Steering.
- DRS.

The lap performance graph is intentionally long and horizontally scrollable so telemetry changes are easier to inspect.

## Lap Performance Analysis

Route: `/analysis/:sessionId/lap/:lapId`

This page is available from:

- Leaderboard rows.
- Session review lap rows.

It shows:

- Driver.
- Track.
- Date.
- Lap time.
- Validity.
- Sector times.
- Delta to personal best or best available lap.
- Cornering speed.
- Braking distance.
- DRS usage.
- Assist settings.
- Synced map and chart.

Interaction features:

- Hovering the telemetry graph moves the driver marker on the map to the matching sample position.
- Sector boundary lines are drawn on the graph.
- Replay controls move through the lap in real time.
- Replay can pause, resume, rewind, fast forward, and change speed.

If opened from a session page with `?from=session`, the back button should return to that session rather than the leaderboard.

## Session Details

Route: `/session/:sessionId`

Session details behaves differently depending on whether the session is active or ended.

Active session:

- Shows live telemetry.
- Shows live map.
- Shows current lap timing.
- Uses the same live components as the live telemetry page.

Ended session:

- Shows post-session summary.
- Shows complete session graph.
- Shows lap breakdown table.
- Shows AI coaching evidence.
- Lets the user open each lap in the lap performance analysis page.

Session metadata includes:

- Start time.
- End time.
- Track.
- Session type.
- Custom setup: yes/no/unknown.
- Equal performance: yes/no/unknown.
- Active/latest state.

## Leaderboard

Route: `/leaderboard`

The leaderboard compares valid laps only.

Rules:

- Only valid laps count.
- Implausible lap times are ignored.
- Each user appears once per track/scope using their best valid real lap.
- Theoretical best laps do not count.
- Tracks are compared separately.

Scopes:

- All time.
- Weekly.
- Daily.

Weekly reset:

- Weekly scope starts at Monday 00:00 based on the configured timezone offset.
- It effectively ends after Sunday and starts a new week on Monday.

Display:

- The top player for the selected track/scope appears in a banner.
- Sector cells highlight global fastest sector values for the selected leaderboard. Only one fastest Sector 1, one fastest Sector 2, and one fastest Sector 3 should be purple.
- Row click opens lap performance analysis.
- Assist icons replace session info in the leaderboard row.

## Profile

Route: `/profile`

Profile shows:

- Driver account info.
- Team theme/profile preferences.
- Profile image.
- AI racing suit output when available.
- User sessions.
- Listener token panel.

Session cards:

- Show latest/active status.
- Show track.
- Show start/end time.
- Show best lap.
- Show top speed.
- Show total laps.
- Show custom setup/equal performance if available.

Clicking a session opens the session details page.

## Edit Profile

Route: `/edit-profile`

Users can update their profile preferences, including profile photo/team theme fields used by the profile media studio.

## AI Racing Suit

The AI racing suit feature creates a profile image styled as an F1 racing suit.

Flow:

1. User logs in through the custom backend.
2. Backend returns a Firebase custom token.
3. Frontend signs into Firebase Auth using `signInWithCustomToken`.
4. User uploads/selects a profile photo.
5. Frontend sends photo and team choice to the Firebase Cloud Function.
6. Function verifies Firebase Auth, validates the payload, rate limits the user, preprocesses the image, builds a prompt, calls OpenRouter, postprocesses the result, and returns an image data URL.

Important dependencies:

- Firebase Auth must be working.
- `OPENROUTER_API_KEY` must be set as a Firebase Functions secret.
- `OPENROUTER_MODEL` must be set as a Firebase Functions secret.

## Track Calibration

Route: `/calibrate`

Admin-only feature.

Purpose:

- Align F1 world coordinates to a track image.
- Save anchor points for a track.
- Finalize reusable track maps.

Calibration data is stored under `trackMaps/{trackKey}` and can be reused by map components.

## Post-Session AI Coaching Report

Generated by the backend when a session ends and also updated after laps during live reporting.

The report is stored at:

```text
sessions/{sessionId}/reports/postSession
sessions/{sessionId}/reports/postSession/laps/{lapId}
```

Main report contents:

- Report schema.
- Status.
- Report phase: live or final.
- Data quality.
- Session snapshot.
- Best actual lap.
- Worst valid lap.
- Theoretical best lap.
- Assist summary.
- Coach brief.
- Lap comparison table.
- Precision braking findings.
- Precision cornering findings.
- Top coach signals.
- AI-readable markdown.

The report is designed to be readable by an AI coach without storing huge raw telemetry dumps in one Firestore document.

## Assist Detection

The listener and backend capture assist context when available:

- Traction control: off, medium, full.
- Anti-lock brakes.
- Gearbox/manual/suggested/automatic.
- DRS assist.
- Steering assist.
- Braking assist.
- Pit assist.
- Pit release assist.
- ERS assist.
- Dynamic racing line.

Assist data appears:

- In lap documents.
- In telemetry samples.
- On leaderboard rows.
- On live/session lap tables.
- In post-session AI reports.

## Custom Setup and Equal Performance

The listener tries to read:

- Custom setup: yes/no.
- Equal performance: yes/no.

These are saved on the session and included in:

- Live telemetry session cards.
- Profile session cards.
- Session details.
- Post-session AI reports.

These fields help the AI and leaderboard viewers understand whether conditions are directly comparable.

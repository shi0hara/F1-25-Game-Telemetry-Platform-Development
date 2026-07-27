# Listener Guide

The listener is the bridge between F1 25 and the backend.

File:

```text
revamp.py
```

## What the Listener Does

The listener:

- Opens UDP port `20777`.
- Waits for F1 25 telemetry packets.
- Identifies the player car.
- Creates or resolves the driver account.
- Starts a backend session only when an active F1 session is detected.
- Sends live latest telemetry.
- Sends batches of historical telemetry.
- Sends lap timing.
- Sends sector timing from session history packets.
- Sends assist settings.
- Sends custom setup and equal performance when detected.
- Sends map/world coordinates.
- Detects corners and braking zones.
- Ends the backend session when the driver leaves the F1 session.
- Keeps listening after a session ends, so a new game session can start without restarting the listener.

## F1 25 UDP Settings

In F1 25:

- UDP telemetry: On.
- UDP broadcast mode: Off for same PC, on only if needed for another machine.
- UDP IP: `127.0.0.1` for same PC.
- UDP port: `20777`.
- UDP send rate/frequency: use the highest available setting for the most responsive live page.

The listener itself binds to:

```text
0.0.0.0:20777
```

## Running the Listener

```powershell
python .\revamp.py
```

The listener no longer needs to prompt for account details during the normal website flow.

It starts a local-only website pairing API:

```text
http://127.0.0.1:51377
```

The same local API exposes the newest decoded sample for true live display:

```text
GET http://127.0.0.1:51377/live-stream
GET http://127.0.0.1:51377/live
```

The frontend prefers `/live-stream`, which pushes samples immediately with server-sent events. `/live` remains a polling fallback. These local endpoints are used only when the local listener reports the same active `sessionId` as the page being viewed. Firestore/backend data remains the fallback and the source for saved history, lap analysis, leaderboard, and reports.

During an active session, the Current Telemetry card shows the live data source and sample rate. For the most responsive display it should say `Local stream`; `Local poll` is acceptable fallback; `Cloud backup` means the page is using slower backend/Firestore updates.

When the user logs in on the website, the website pairs the listener to that account automatically.

When the user logs out on the website, the website tells the listener to clear the active account.

Preferred identity flow:

1. User logs in through frontend.
2. Frontend detects the local listener.
3. Frontend creates a listener token.
4. Frontend sends the token to the local listener.
5. Listener stores the token in `.listener-config.json`.
6. Listener uses the token for future backend identity until logout/unpair.

By default, the listener waits for the website to confirm the active account on startup. This avoids recording telemetry to an old account if the website was logged out while the listener was closed.

If you want the listener to immediately reuse the last saved token on startup, run it with:

```powershell
$env:LISTENER_TRUST_SAVED_TOKEN="true"
python .\revamp.py
```

Manual username/email prompts can be re-enabled only for debugging:

```powershell
$env:ALLOW_MANUAL_LISTENER_LOGIN="true"
python .\revamp.py
```

The listener should never ask for or store the account password.

## Session Start Detection

The listener does not create a session immediately on launch.

It waits for real F1 session packet data:

- Valid session type.
- Valid track id/name.
- Game session UID when available.
- Active game state.

This prevents fake sessions from being created while sitting in menus.

## Session End Detection

The listener should end a backend session only when the game session actually ends or the user leaves it.

End sources include:

- Session end event packet.
- Final classification packet.
- Leaving the active game session.
- New game session UID detected.
- Listener shutdown.

Pausing the game should not end the session.

Ending a backend session does not stop the listener. It stays active and waits for the next game session.

## Telemetry Sent Live

Latest telemetry can include:

- `speedKph`
- `throttle`
- `brake`
- `steering`
- `rpm`
- `gear`
- `drs`
- `drsAvailable`
- `lapNumber`
- `currentSector`
- `lapDistance`
- `totalDistance`
- `worldX`
- `worldY`
- `worldZ`
- `yaw`
- `pitch`
- `roll`
- `assists`

The frontend uses this for:

- Current stats.
- Live speed trace.
- Live car marker.
- Current lap trail.

## Telemetry Batches

The listener batches telemetry samples so the backend is not overloaded by one request per UDP packet.

Batch data is used later for:

- Lap trails.
- Session telemetry graphs.
- Lap performance graph.
- Replay.
- Post-session report generation.

## Lap Timing

The listener can detect completed laps from:

- Lap data packets.
- Session history packets.

It sends:

- Lap number.
- Lap time.
- Sector 1.
- Sector 2.
- Sector 3.
- Valid flag.
- Track info.
- Assist snapshot.

Plausibility filters reject unrealistic lap times, such as zero or extremely short/long laps.

## Assist Detection

The listener reads assists from session/car status packets when available.

Captured assists:

- Traction control.
- Anti-lock brakes.
- Gearbox assist.
- Automatic gearbox.
- Suggested gear.
- DRS assist.
- Steering assist.
- Braking assist.
- Pit assist.
- Pit release assist.
- ERS assist.
- Dynamic racing line.

Assist data is attached to telemetry samples and completed lap documents.

## Custom Setup and Equal Performance

The listener attempts to detect:

- `customSetup`
- `equalPerformance`

These fields are sent during session creation and later metadata syncs.

If the F1 packet library does not expose those fields for a session type, the backend stores them as unknown/null.

## Map Requirements

For the telemetry map to work, Motion packet 0 must be arriving.

Important world fields:

- `worldX`
- `worldY`
- `worldZ`

If map trails do not appear, check:

- F1 UDP telemetry is enabled.
- Motion packet data is being received.
- The listener console does not show map warnings.
- The backend `/telemetry/batch` response has `mapPointCount > 0`.

## Common Listener Output

Healthy startup:

```text
Waiting for an active F1 game session...
Game session detected.
Game session started. SESSION ID: ...
```

Completed lap:

```text
---> LAP 2 COMPLETED! Time: 78042 ms <---
```

Session end:

```text
Telemetry session ended. Detected at ... (left_game_session)
Post-session AI report saved in Firebase.
Listener is still active. Waiting for the next game session...
```

## Do Not Do

- Do not enter real account passwords into random local listener copies.
- Do not stop the listener between every session unless debugging.
- Do not compare sessions if F1 UDP settings changed halfway through.
- Do not assume map problems are frontend-only; missing Motion packets are usually listener/game settings.

## Quick Debug Commands

Backend health:

```powershell
Invoke-RestMethod -Uri "https://f1-telementry-1.onrender.com/health"
```

Schema:

```powershell
Invoke-RestMethod -Uri "https://f1-telementry-1.onrender.com/schema"
```

Run listener:

```powershell
python .\revamp.py
```

## OpenRouter API Key

The listener uses OpenRouter to send the post-session telemetry report to an AI coach (model: `anthropic/claude-opus-4.8`) when a game session ends. The AI coach response is then uploaded to the backend and displayed in the web app's session review page.

Set the key permanently on Windows:

```powershell
[System.Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", "sk-or-v1-your-key-here", "User")
```

Or for the current session only:

```powershell
$env:OPENROUTER_API_KEY = "sk-or-v1-your-key-here"
python .\revamp.py
```

Get your key at: https://openrouter.ai/keys

Without this key, the local report files (`post_session_ai_report.md`, `post_session_ai_report.json`) are still generated, but no AI coaching response is produced or uploaded.

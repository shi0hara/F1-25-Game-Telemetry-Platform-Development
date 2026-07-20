# Report Generation

This document explains how the platform creates AI-readable post-session coaching reports.

## Goal

The report should give an AI coach enough structured evidence to produce accurate feedback without sending every raw telemetry row.

The report is designed to answer:

- What was the best actual lap?
- What was the theoretical best lap from the driver's best valid sectors?
- Where did the driver lose time compared with their own best lap?
- Which braking zones need work?
- Which corner exits need work?
- Did assists affect the interpretation?
- Was custom setup or equal performance enabled?
- How reliable is the data?

## Storage Location

Main compact report:

```text
sessions/{sessionId}/reports/postSession
```

Detailed lap report docs:

```text
sessions/{sessionId}/reports/postSession/laps/{lapId}
```

The main report is compact to avoid Firestore document limits and Render memory problems.

## Current Schema

```text
f1-coach-evidence-report-v5
```

## When Reports Are Generated

Live/lap report:

- Triggered after completed laps.
- Phase is `live`.
- Useful for gradually building coaching evidence before the session ends.

Final report:

- Triggered when `/sessions/:id/end` is called.
- Phase is `final`.
- Uses final lap, telemetry, corner, and session metadata.

## Data Sources

The backend builds reports from:

- `sessions/{sessionId}` session snapshot.
- `sessions/{sessionId}/telemetryChunks` sampled telemetry.
- `sessions/{sessionId}/laps` lap timing rows.
- `sessions/{sessionId}/corners` detected corner/braking rows.

## Important Inputs

Telemetry samples can include:

- Speed.
- Throttle.
- Brake.
- Steering.
- RPM.
- Gear.
- DRS active.
- DRS available.
- DRS activation delay.
- Lap number.
- Sector.
- Lap distance.
- Total distance.
- World position.
- Assist state.

Lap rows can include:

- Lap time.
- Sector 1/2/3 time.
- Validity.
- Track.
- Assist snapshot.

Session rows can include:

- Track.
- Session type.
- Start/end time.
- Custom setup.
- Equal performance.

## Main Report Fields

| Field | Meaning |
| --- | --- |
| `schema` | Report schema version |
| `status` | `ready` or `empty` |
| `reportPhase` | `live` or `final` |
| `reportTrigger` | Why the report was generated |
| `generatedAtIso` | Report generation timestamp |
| `dataQuality` | Confidence, coverage, limitations |
| `sessionSnapshot` | Driver/session/track/setup context |
| `bestLap` | Best actual valid lap |
| `worstLap` | Worst valid lap |
| `theoreticalBestLap` | Best valid S1 + S2 + S3 combination |
| `assistSummary` | Session-wide assist context |
| `coachBrief` | Short AI-first summary |
| `lapComparisonTable` | Compact lap-by-lap comparison |
| `lapSummaries` | Compact per-lap summary |
| `precisionFindings` | Braking/corner findings |
| `topCoachSignals` | Highest priority coach signals |
| `aiReadableMarkdown` | Report formatted for AI coach prompting |

## Theoretical Best Lap

Theoretical best lap is:

```text
best valid Sector 1 + best valid Sector 2 + best valid Sector 3
```

It is not a real driven lap.

It is used as a pace ceiling to show how much time may be available if the driver combines their best sectors.

The AI should compare:

- Weak laps to the best actual lap.
- Best actual lap to theoretical best lap.
- Sector gaps to identify where performance was left on the table.

## Braking Analysis

The backend identifies braking zones from telemetry samples where brake pressure crosses a threshold.

Reported evidence can include:

- Start and end lap distance.
- Entry speed.
- Minimum speed.
- Exit speed.
- Peak brake percentage.
- Time spent coasting after brake release.
- Brake/throttle overlap.
- Comparison to best lap zone.
- Issue tags.

Example coaching interpretation:

- Braking too early and still carrying less minimum speed.
- Holding peak brake too long.
- Coasting after brake release.
- Losing exit speed compared with best lap.

## Cornering Analysis

Cornering zones are detected using steering angle and speed behavior.

Reported evidence can include:

- Start and end lap distance.
- Apex speed.
- Exit speed.
- Throttle at apex.
- Coasting percentage.
- Throttle pickup delay.
- Peak steering.
- Steering smoothness.
- Comparison to best lap.

Example coaching interpretation:

- Late throttle pickup.
- Too much coasting through mid-corner.
- Too much steering while adding throttle.
- Lower exit speed than the best-lap reference.

## Apex Corner Analysis

When enough map/lap-distance data exists, the report also compares apex-like corner points.

Evidence can include:

- Apex distance.
- Minimum corner speed.
- Brake distance before apex.
- Exit speed.
- Distance from apex to full throttle.
- Delta versus reference lap.
- Exit measurement confidence.

Important AI rule:

- Only make confident exit-speed claims when `exitMeasurementConfidence` is high.

## Assist Summary

The v5 report includes assist context.

Captured assist fields:

- Traction control.
- ABS.
- Gearbox mode.
- Automatic gearbox.
- Suggested gear.
- DRS assist.
- Steering assist.
- Braking assist.
- Pit assist.
- Pit release assist.
- ERS assist.
- Dynamic racing line.

The report includes:

- `assistSummary.summaryLine`
- `assistSummary.activeAssists`
- `assistSummary.changedDuringSession`
- `assistSummary.lapSnapshots`
- Per-lap `assists`
- Per-lap `assistSummary`

The AI should use assists as context, not as an insult or automatic negative judgement.

Examples:

- ABS changes how braking lockup advice should be written.
- Traction control changes throttle-exit advice.
- Automatic gearbox changes gear-choice advice.
- DRS assist changes whether DRS reaction-time advice matters.

## Custom Setup and Equal Performance

The report includes:

- `sessionSnapshot.customSetup`
- `sessionSnapshot.equalPerformance`
- `coachBrief.setupContext`

These fields are important for fairness and context.

If custom setup is enabled:

- The AI can mention setup may influence stability, braking, and top speed.

If equal performance is disabled:

- The AI should be careful comparing sessions or drivers directly.

## Data Quality

The report assigns confidence based on:

- Sample count.
- Timed lap count.
- Valid timed lap count.
- Sector availability.
- Pedal coverage.
- Steering coverage.
- Lap distance coverage.
- World position availability.
- Corner event count.

Possible confidence:

- `high`
- `medium`
- `low`

The AI should lower confidence when the report says data is limited.

## AI-Readable Markdown

The markdown version is stored in:

```text
aiReadableMarkdown
```

It includes:

- AI instructions.
- Coach brief.
- Data quality.
- Session context.
- Session summary.
- Lap comparison.
- Coach signals.
- Braking findings.
- Corner findings.
- Lap details.
- Requested AI output format.

This field is intended to be pasted or sent directly to an AI coach model.

## Memory Safety

The backend avoids storing or processing too much at once.

Important limits are controlled by environment variables:

| Variable | Purpose |
| --- | --- |
| `POST_SESSION_CHUNK_PAGE_SIZE` | Firestore chunk read page size |
| `POST_SESSION_MAX_SAMPLES_PER_LAP` | Per-lap sample cap |
| `POST_SESSION_MAX_TOTAL_SAMPLES` | Whole report sample cap |
| `POST_SESSION_MAX_LAP_DETAIL_DOCS` | Max detailed lap docs |
| `POST_SESSION_MAX_FINDINGS` | Max precision findings in compact output |
| `POST_SESSION_MAX_SIGNALS` | Max coach signals in compact output |
| `POST_SESSION_MAX_MARKDOWN_LAPS` | Max laps included in markdown |
| `POST_SESSION_MAX_MARKDOWN_CHARS` | Markdown storage cap |
| `POST_SESSION_LIVE_ANALYZED_LAPS` | Live report lap cap |
| `POST_SESSION_FINAL_ANALYZED_LAPS` | Final report lap cap |

If Render runs out of memory, lower these caps first.

## How To View a Report

Frontend:

- Open Profile.
- Click a completed session.
- View AI Coaching Evidence on the session review page.

Firestore:

```text
sessions/{sessionId}/reports/postSession
```

Backend:

```powershell
Invoke-RestMethod -Uri "https://f1-telementry-1.onrender.com/sessions/<sessionId>/reports/post-session" -Headers @{ Authorization = "Bearer <token>" }
```

## Good AI Prompting Pattern

When sending the report to an AI coach, ask for:

1. Session overview in 3 short bullets.
2. Top 3 improvements, each backed by telemetry evidence.
3. One lap-specific comparison to the best actual lap and theoretical best lap.
4. One braking drill.
5. One corner-exit drill.
6. Confidence score based on data quality.

The report itself already asks for this in its `Requested AI Output` section.

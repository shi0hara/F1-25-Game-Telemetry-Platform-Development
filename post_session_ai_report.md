# F1 25 Post-Session AI Telemetry Report

This file is designed for an AI coach to read. It summarizes the session instead of dumping every raw telemetry row.

## Session Snapshot

- Report schema: `f1-post-session-ai-report-v1`
- Generated at: 2026-07-17T06:50:49Z
- Samples analysed: 1784
- Laps detected: 3
- Approx session duration: 6:06.04
- Average speed: 231.4 kph
- Top speed: 326 kph
- Lap duration spread: 80.13 sec

## Driving Assists

- **Active:** ABS, Gearbox (Suggested), ERS Assist, Dynamic Racing Line
- **Disabled:** Traction Control, Braking Assist, Steering Assist, DRS Assist

## How To Coach From This File

- Prioritize high severity coach signals first.
- Compare laps against each other, not against a generic ideal lap.
- Look for patterns: long coasting, throttle/brake overlap, low full-throttle percentage, and heavy braking time.
- Give specific, actionable tips: where to brake, where to release brake, when to commit to throttle, and how to smooth steering.
- If driving assists are active, suggest a path to gradually reducing them.

## Lap Summary

| Lap | Approx time | Avg speed | Top speed | Full throttle | Heavy brake | Coasting | Pedal overlap | Brake zones | Corner zones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2:38.17 | 224.8 kph | 325 kph | 61.6% | 12.9% | 8.3% | 1.5% | 6 | 8 |
| 2 | 1:18.04 | 240.3 kph | 326 kph | 72.0% | 9.1% | 1.8% | 0.9% | 6 | 6 |
| 3 | 2:09.62 | 227.0 kph | 326 kph | 65.7% | 9.2% | 7.7% | 0.8% | 6 | 8 |

## Coach Signals

### Signal 1: Driving Assists

- Severity: info
- Lap: all
- Evidence: Active assists: ABS (Anti-Lock Brakes), Suggested Gear, ERS Assist, Dynamic Racing Line.
- Coaching angle: The driver is using driving assists. To improve long-term pace and car control, consider gradually reducing assists. Start by disabling one at a time: racing line first, then ABS, then traction control. Manual inputs give finer control over braking points, throttle application, and corner entry.

## Lap Details

### Lap 1

- Approx duration: 2:38.17
- Distance covered: 6255.8 m
- Average speed: 224.8 kph
- 95th percentile speed: 322.0 kph
- Max speed: 325 kph
- Average throttle: 72.6%
- Full throttle: 61.6%
- Average brake: 11.9%
- Heavy brake: 12.9%
- Coasting: 8.3%
- Throttle/brake overlap: 1.5%
- Longest throttle/brake overlap: 0:56.94
- Longest coast: 0:02.03
- Average absolute steering: 0.101
- Max absolute steering: 1.000
- DRS active: 32.0%
- DRS activations: 0
- DRS avg reaction time: -
- DRS fastest reaction: -
- DRS slowest reaction: -

Braking zones:

| # | Start | End | Distance | Entry | Min | Exit | Peak brake |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | -698.6 m | -657.5 m | 41.1 m | 196 kph | 118 kph | 118 kph | 95.5% |
| 2 | 272.9 m | 336.4 m | 63.6 m | 323 kph | 215 kph | 219 kph | 100.0% |
| 3 | 982.1 m | 1074.8 m | 92.6 m | 306 kph | 138 kph | 162 kph | 100.0% |
| 4 | 1809.7 m | 1849.5 m | 39.8 m | 291 kph | 229 kph | 229 kph | 100.0% |
| 5 | 4020.0 m | 4112.5 m | 92.5 m | 283 kph | 122 kph | 122 kph | 100.0% |
| 6 | 4560.6 m | 4624.0 m | 63.4 m | 240 kph | 120 kph | 120 kph | 100.0% |

Cornering zones:

| # | Start | End | Avg speed | Min speed | Avg throttle | Peak steering |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | -870.4 m | -834.8 m | 218 kph | 217 kph | 0.98 | 0.284 |
| 2 | -644.9 m | -602.8 m | 106 kph | 91 kph | 0.08 | 0.717 |
| 3 | -505.9 m | -486.3 m | 154 kph | 148 kph | 0.72 | 0.348 |
| 4 | 329.2 m | 354.3 m | 215 kph | 201 kph | 0.02 | 0.373 |
| 5 | 1091.5 m | 1136.2 m | 112 kph | 102 kph | 0.23 | 0.614 |
| 6 | 1197.9 m | 1258.1 m | 152 kph | 145 kph | 0.38 | 0.402 |
| 7 | 3311.0 m | 3351.5 m | 252 kph | 248 kph | 0.74 | 0.342 |
| 8 | 3387.8 m | 3410.4 m | 243 kph | 240 kph | 1.00 | 0.305 |

### Lap 2

- Approx duration: 1:18.04
- Distance covered: 5271.4 m
- Average speed: 240.3 kph
- 95th percentile speed: 322.0 kph
- Max speed: 326 kph
- Average throttle: 82.6%
- Full throttle: 72.0%
- Average brake: 8.8%
- Heavy brake: 9.1%
- Coasting: 1.8%
- Throttle/brake overlap: 0.9%
- Longest throttle/brake overlap: -
- Longest coast: 0:00.20
- Average absolute steering: 0.099
- Max absolute steering: 0.758
- DRS active: 32.5%
- DRS activations: 0
- DRS avg reaction time: -
- DRS fastest reaction: -
- DRS slowest reaction: -

Braking zones:

| # | Start | End | Distance | Entry | Min | Exit | Peak brake |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 264.6 m | 335.0 m | 70.4 m | 324 kph | 205 kph | 205 kph | 100.0% |
| 2 | 987.3 m | 1089.7 m | 102.5 m | 307 kph | 123 kph | 123 kph | 100.0% |
| 3 | 1801.5 m | 1847.0 m | 45.5 m | 292 kph | 219 kph | 219 kph | 100.0% |
| 4 | 3246.9 m | 3273.3 m | 26.5 m | 321 kph | 281 kph | 281 kph | 93.3% |
| 5 | 4033.2 m | 4134.2 m | 101.0 m | 317 kph | 137 kph | 137 kph | 100.0% |
| 6 | 4561.7 m | 4638.5 m | 76.8 m | 250 kph | 110 kph | 110 kph | 100.0% |

Cornering zones:

| # | Start | End | Avg speed | Min speed | Avg throttle | Peak steering |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 335.0 m | 362.5 m | 193 kph | 187 kph | 0.27 | 0.325 |
| 2 | 1078.6 m | 1133.7 m | 114 kph | 104 kph | 0.29 | 0.598 |
| 3 | 1201.7 m | 1257.2 m | 153 kph | 148 kph | 0.53 | 0.402 |
| 4 | 4121.7 m | 4174.2 m | 129 kph | 117 kph | 0.21 | 0.563 |
| 5 | 4628.2 m | 4686.5 m | 104 kph | 96 kph | 0.29 | 0.758 |
| 6 | 4751.5 m | 4768.8 m | 152 kph | 152 kph | 0.52 | 0.272 |

### Lap 3

- Approx duration: 2:09.62
- Distance covered: 5263.4 m
- Average speed: 227.0 kph
- 95th percentile speed: 321.0 kph
- Max speed: 326 kph
- Average throttle: 76.0%
- Full throttle: 65.7%
- Average brake: 8.8%
- Heavy brake: 9.2%
- Coasting: 7.7%
- Throttle/brake overlap: 0.8%
- Longest throttle/brake overlap: -
- Longest coast: 0:07.95
- Average absolute steering: 0.103
- Max absolute steering: 0.688
- DRS active: 31.2%
- DRS activations: 0
- DRS avg reaction time: -
- DRS fastest reaction: -
- DRS slowest reaction: -

Braking zones:

| # | Start | End | Distance | Entry | Min | Exit | Peak brake |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 275.4 m | 329.6 m | 54.1 m | 315 kph | 222 kph | 222 kph | 100.0% |
| 2 | 985.4 m | 1088.4 m | 103.0 m | 312 kph | 125 kph | 125 kph | 100.0% |
| 3 | 1806.0 m | 1822.8 m | 16.8 m | 289 kph | 261 kph | 261 kph | 100.0% |
| 4 | 3252.0 m | 3277.4 m | 25.4 m | 312 kph | 270 kph | 270 kph | 88.3% |
| 5 | 4033.0 m | 4132.1 m | 99.1 m | 315 kph | 141 kph | 141 kph | 100.0% |
| 6 | 4564.1 m | 4632.4 m | 68.3 m | 246 kph | 122 kph | 124 kph | 100.0% |

Cornering zones:

| # | Start | End | Avg speed | Min speed | Avg throttle | Peak steering |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 342.3 m | 390.4 m | 193 kph | 186 kph | 0.36 | 0.363 |
| 2 | 1076.4 m | 1134.6 m | 117 kph | 105 kph | 0.24 | 0.606 |
| 3 | 1206.5 m | 1266.5 m | 150 kph | 144 kph | 0.38 | 0.416 |
| 4 | 1851.5 m | 1864.5 m | 221 kph | 217 kph | 0.17 | 0.294 |
| 5 | 4120.2 m | 4178.2 m | 132 kph | 123 kph | 0.24 | 0.463 |
| 6 | 4382.0 m | 4411.7 m | 216 kph | 211 kph | 0.71 | 0.287 |
| 7 | 4636.3 m | 4689.0 m | 103 kph | 96 kph | 0.32 | 0.688 |
| 8 | 4760.4 m | 4773.2 m | 155 kph | 152 kph | 0.69 | 0.343 |

## Recommended AI Output Format

Ask the AI coach to reply with:

1. Session overview in 3 short bullets.
2. Top 3 improvements, each backed by telemetry evidence from this file.
3. One lap-specific coaching note.
4. One drill for the next session.
5. A short confidence score explaining how complete the telemetry data was.

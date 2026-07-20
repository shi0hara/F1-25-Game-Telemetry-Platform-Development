# F1 25 Game Telemetry Platform

This project is a full telemetry platform for F1 25. It captures live UDP telemetry from the game, saves sessions to Firebase, shows live and post-session analysis in a React frontend, and prepares AI-readable coaching reports.

## Main Features

- Account sign up and login with backend password hashing.
- Normal user and admin roles.
- Listener tokens for connecting a local PC telemetry listener.
- Website-to-listener auto pairing after login, with logout unpairing.
- Live telemetry dashboard with speed, throttle, brake, RPM, gear, DRS, steering, and map position.
- Lap trails that reset per lap and can be viewed later.
- Session review pages for live and completed sessions.
- Lap performance analysis with replay controls, synced chart and map hover position, sector markers, and assist indicators.
- Track leaderboard with all-time, weekly, and daily scopes.
- Track-scoped leaderboard filtering so laps are compared only against the same circuit.
- Admin dashboard for user management, suspension, role changes, and session deletion.
- Admin-only track calibration.
- AI racing suit profile image generation through Firebase Cloud Functions and OpenRouter.
- Post-session AI coaching report generation with braking, cornering, assists, theoretical best lap, and data quality evidence.

## Repository Layout

```text
.
  frontend/                 React app
  functions/                Firebase Cloud Functions for AI racing suit generation
  docs/                     Project documentation
  revamp.py                 F1 25 UDP listener
  build_post_session_ai_report.py
  post_session_ai_report.md Example local report output
  post_session_ai_report.json

backend repository/folder
  server.js                 Express API used by frontend and 
  seed-test-users.mjs       Test/admin account seed script
  serviceAccountKey.json    Local Firebase Admin credentials for local development
```

## Quick Start

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Backend:

```powershell
cd path\to\backend
npm install
npm start
```

Listener:

```powershell
python .\revamp.py
```

Firebase Functions:

```powershell
npx firebase-tools deploy --only functions --project f1telementrydatabase
```

## Documentation

- [Documentation Index](docs/README.md)
- [Feature Guide](docs/FEATURES.md)
- [Setup and Deployment](docs/SETUP_AND_DEPLOYMENT.md)
- [Architecture and Data Model](docs/ARCHITECTURE_AND_DATA.md)
- [API Reference](docs/API_REFERENCE.md)
- [Listener Guide](docs/LISTENER_GUIDE.md)
- [Report Generation](docs/REPORT_GENERATION.md)
- [Security and Privacy](docs/SECURITY_AND_PRIVACY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Important Notes

- Do not commit real API keys, Firebase service account files, or `.env` secrets.
- The frontend default backend is `https://f1-telementry-1.onrender.com`, unless `VITE_API_BASE` is set.
- The AI racing suit function uses Firebase Auth custom tokens from the backend login flow.
- Firestore open rules are useful for debugging but should not be used for production submission.

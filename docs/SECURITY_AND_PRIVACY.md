# Security and Privacy

This project handles user accounts, passwords, telemetry data, profile photos, and API keys. Treat it like a real user-data system even during development.

## Authentication Model

The project uses two auth layers:

1. Custom backend auth.
2. Firebase Auth custom token sign-in.

Custom backend auth is used for:

- Login.
- Admin endpoints.
- Listener token management.
- Protected backend data.

Firebase Auth is used for:

- AI racing suit Cloud Function authentication.
- Firebase Function user identity.

The backend login response should include:

- `token`: backend session token.
- `firebaseToken`: Firebase custom token.
- `user`: public user object.

The frontend stores the backend token in local storage as:

```text
f1AuthToken
```

## Passwords

Passwords must never be stored as plain text.

The backend stores password hashes using bcryptjs.

Never log:

- Raw password.
- Password hash.
- Auth session token.
- Firebase custom token.

## Roles

Supported roles:

- `user`
- `admin`

Admin users can:

- View all users.
- Edit accounts.
- Suspend users.
- Delete session/time data.
- Access track calibration.

Normal users should only see their own sessions, except public leaderboard lap rows.

## Admin Safety Rules

Backend protection includes:

- Admin cannot remove their own admin role.
- Admin cannot suspend their own account.
- Admin endpoints require authenticated admin role.

Recommended extra protection:

- Keep at least one known admin account.
- Do not share admin test credentials outside the team.
- Rotate test passwords before final demo if public.

## Listener Tokens

Listener tokens are safer than entering account passwords into the listener.

Rules:

- Display the raw listener token only once after creation.
- Store only a hash of the token in Firestore.
- Allow users to revoke tokens.
- Track `lastUsedAt`.

If a listener token leaks:

1. Revoke it in the profile token panel.
2. Generate a new token.
3. Restart the listener with the new token.

## Firestore Rules

Open rules are acceptable only for temporary debugging.

Production-like rules should enforce:

- Users can read/write their own profile only.
- Admins can read/write accounts through trusted paths.
- Sessions are readable by owner and admins.
- Leaderboard data can be public only if it excludes private fields.
- Track maps can be public read if no private data is stored there.
- Direct client writes to telemetry/session internals should be restricted.

Even though the backend checks access, Firestore rules still matter because the frontend uses direct Firestore reads for some views.

## Public Leaderboard Privacy

Leaderboard rows are intentionally visible to everyone.

Rows should include only:

- Username.
- Track.
- Lap time.
- Sector times.
- Validity.
- Assist summary/icons.
- Session/lap ids needed to open public analysis.

Rows should not include:

- Email.
- Password hash.
- Backend auth token.
- Raw account metadata.

## Session Privacy

Normal user expected access:

- Own sessions.
- Own live telemetry.
- Own post-session details.

Admin expected access:

- All sessions, when using admin views/toggles.

Public expected access:

- Leaderboard.
- Public lap performance if intentionally exposed from leaderboard.

## Secrets

Never commit:

- `serviceAccountKey.json`
- `.env`
- OpenRouter API key
- OpenAI API key
- Gemini API key
- Firebase private key
- Render secrets

Use secret managers:

- Render environment variables for backend secrets.
- Firebase Functions secrets for function secrets.

Firebase Functions secret commands:

```powershell
npx firebase-tools functions:secrets:set OPENROUTER_API_KEY --project f1telementrydatabase
npx firebase-tools functions:secrets:set OPENROUTER_MODEL --project f1telementrydatabase
```

## API Keys in Frontend

Firebase web config is allowed to be public in frontend code, but security must come from:

- Firebase Auth.
- Firestore rules.
- Backend validation.
- API role checks.

Do not put provider secret keys in frontend code.

## Profile Photos and AI Images

Profile photos and generated AI racing suit images can contain personal data.

Recommended handling:

- Let users delete or replace their image.
- Do not log base64 image payloads.
- Keep image size limits.
- Rate-limit generation.
- Avoid storing provider responses longer than needed unless needed for the profile feature.

## Rate Limiting

The AI racing suit function rate-limits by Firebase UID.

Purpose:

- Prevent accidental provider cost spikes.
- Prevent repeated abuse.
- Protect function performance.

## Deployment Review Checklist

Before final demo or submission:

1. Confirm no real secrets are committed.
2. Confirm test passwords are not reused anywhere important.
3. Confirm admin account is intentional.
4. Confirm normal user cannot open `/admin`.
5. Confirm normal user cannot open `/calibrate`.
6. Confirm normal user sees only own sessions unless viewing public leaderboard.
7. Confirm backend `/auth/login` does not expose password hash.
8. Confirm Firestore rules are not fully open if presenting as production-ready.
9. Confirm AI function requires Firebase Auth.
10. Confirm deleted/revoked listener tokens cannot connect.

## Incident Response

If a secret leaks:

1. Revoke the leaked key/token.
2. Create a new key/token.
3. Update Render/Firebase secret manager.
4. Redeploy affected service.
5. Remove the leaked value from git history if it was committed.
6. Tell the team which key was rotated.

If an account is compromised:

1. Suspend the user from admin dashboard.
2. Revoke listener tokens.
3. Reset password manually or recreate the account.
4. Review sessions for suspicious data deletion.

# Google authentication and profile validation — 2026-09-29

## Findings and fixes

The original backend at port 5000 returned HTTP 503 with the exact "Google sign-in is not configured" message even though both files contained matching nonempty OAuth client IDs. The actual frontend was listening on 5174, not 5173. This was stale backend startup configuration, not an incorrect Vite variable name or hardcoded frontend null. After the source watcher reloaded the backend, the real Google endpoint rejected an intentionally invalid credential with HTTP 401 instead of 503. No verification bypass was added.

A fresh frontend was started at localhost:5173. Inspection of Vite's served module confirmed that its client ID was nonempty and matched the file, without printing the value. GIS rendered its official button on Login and Register. The button click did not expose a Google account-selection window through the in-app browser, so a real credential exchange and Google account login are NOT verified.

Backend development now watches `.env` as well as source files. Startup reports only whether Google authentication is configured. The frontend has explicit root/envDir paths and refuses silent port fallback. Explicit alternate development ports are supported with loopback-only development CORS; Google Cloud still requires each exact authorized origin. Production CORS is restricted to configured origins and never accepts a wildcard.

Profile editing covers stored name, local-account email, and HTTPS avatar URL. Local email changes require current-password confirmation, email validation, normalization, duplicate protection and a guarded atomic update. Google-linked email and internal identity/security fields remain protected. No password-change backend exists, so none is invented. The UI provides Save/Cancel, validation, pending states, disabled unchanged saves, immediate AuthContext updates, and persisted reload behavior.

## Files changed in this follow-up

- `backend/package.json` — development environment watching.
- `backend/src/server.js` — configuration-presence diagnostic only.
- `backend/src/config/env.js` — no wildcard CORS fallback.
- `backend/src/app.js` — use explicit CORS policy helper.
- `backend/src/utils/corsOrigin.js` — development loopback / production exact-origin policy.
- `backend/src/routes/auth.routes.js` — rate-limit profile password confirmation.
- `backend/src/services/googleAuth.service.js` — distinguish backend configuration errors.
- `backend/src/services/auth.service.js` — validated, password-confirmed profile updates.
- `backend/tests/profile.test.js` — profile and CORS regression coverage.
- `backend/scripts/testGoogleAuth.js` — extended MongoDB/HTTP/profile persistence checks.
- `frontend/vite.config.js` — explicit root/envDir and strict selected port.
- `frontend/src/auth/AuthContext.jsx` — profile field object support.
- `frontend/src/services/api.js` — profile request field allowlist.
- `frontend/src/pages/Settings.jsx` — editable profile form.
- `frontend/tests/profile.test.jsx` — real mounted profile UI/AuthContext tests.
- `README.md` — setup, troubleshooting, port handling and profile policy.
- `GOOGLE_PROFILE_VALIDATION.md` — this report.

Earlier Google-auth implementation changes remain in the working tree. No credentials or infrastructure configuration were changed in this follow-up.

## Validation results

| Check | Passed | Failed |
|---|---:|---:|
| Backend unit tests (including AI, Google, profile and CORS) | 29 | 0 |
| Google/profile integration assertions | 26 | 0 |
| Existing authentication assertions | 34 | 0 |
| Existing real-data integration checks | 84 | 0 |
| Frontend API tests | 8 | 0 |
| Frontend mounted component tests | 14 | 0 |
| Live OpenAI checks | 4 | 0 |
| Live OpenAI/Qdrant pipeline run | 1 | 0 |

Frontend lint and production build passed. Git diff whitespace validation passed. Google integration uses test-only mocked Google verification with real MongoDB, HTTP and application JWTs. Real-data integration uses test-only AI/vector HTTP fixtures. The separately named live AI checks actually call OpenAI and the running Qdrant store.

Live vector result: 3 stored chunks, gpt-4o-mini, text-embedding-3-small, two successful embedding calls plus two chat calls, zero failed calls, measured processing time 10,710 ms. Existing deterministic metrics and duplicate preservation assertions passed.

## Remaining limits

Real Google browser account sign-in still needs the account owner's manual check at localhost:5173. Rendering and configuration checks are not a substitute for that result. Local email ownership is not verified by email delivery because the application has no such infrastructure; current-password confirmation is required and automatic Google linking remains disabled. Alternate localhost ports require matching Google Cloud authorized origins. No secrets were printed or committed, and nothing was pushed.

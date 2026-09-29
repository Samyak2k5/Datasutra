# DataSutra

React/Vite frontend and Node.js/Express/MongoDB backend for data cleaning.

## Google Sign-In / Sign-Up

The Login and Signup pages use Google Identity Services (GIS). The backend verifies the Google ID token with Google's official `google-auth-library`, then issues the same DataSutra JWT used by password login. No Google client secret, Google access token, or Google password is needed.

### Google Cloud setup

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Open **Google Auth Platform** and configure **Branding** (DataSutra app name, support email, developer contact). Configure the **Audience** for your intended users; if using an external app in Testing, add your test accounts where required. Supply your actual homepage/privacy-policy domains for production and complete any verification Google requires.
3. In **Clients**, create an OAuth client with application type **Web application**. Basic identity (`openid`, `email`, `profile`) is sufficient; no Drive/Gmail permissions are needed.
4. Add **Authorized JavaScript origins**: `http://localhost:5173` and `http://localhost`. Use `localhost:5173` in the browser; a different hostname/port requires its own authorized origin.
5. Copy the client ID into both environment files below. This integration uses a JavaScript credential callback, so no OAuth redirect URI or client secret is needed.
6. For production, add your **actual HTTPS frontend origin** (scheme, host and port if non-default; no path). Set the backend's existing `CORS_ORIGIN` to allow that same origin. No production domain is assumed here. Prefer a separate production OAuth client and set its ID in both production environments.

See Google's [GIS setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [server verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

### Environment and local run

Append these entries without replacing your existing MongoDB, JWT, OpenAI or other settings:

```dotenv
# backend/.env
GOOGLE_CLIENT_ID=
```

```dotenv
# frontend/.env
VITE_GOOGLE_CLIENT_ID=
```

Fill both with the **same Web application client ID**. Blank entries safely disable Google login; password authentication stays available. `.env.example` files contain empty placeholders. Local `.env` files are ignored by Git. The OAuth client ID is public configuration; never add a client secret or any private credential to a `VITE_*` variable.

Use Node.js 22.12+ (or a supported newer release). Install dependencies with `npm ci` in each directory. Run `npm run dev` in `backend` (port 5000) and `frontend` (port 5173) in separate terminals. Restart both after changing environment variables; production frontend variables require a new `npm run build`. Vite proxies `/api` to port 5000. For separate production hosting, configure the existing `VITE_API_URL` or an `/api` reverse proxy.

### API and account policy

`POST /api/v1/auth/google` accepts JSON `{ "credential": "<Google ID token>" }`. It returns the existing `{ success, message, data: { user, accessToken } }` response. Only the returned **DataSutra** access token is stored as the application session. Refresh calls the existing `/auth/me`; profile editing and logout use the existing application flow. Logout also disables GIS auto-selection.

The server verifies signature, issuer, intended audience and expiration with Google's library, and requires a nonempty subject and verified email. Browser-supplied names/emails are ignored. Google credentials are never persisted or logged. Requests use JSON over the existing API/CORS flow; this is not Google's form POST redirect flow and does not establish a cookie-based session.

The User schema adds a sparse unique `googleId` index and `authProvider` (`local` by default, or `google`). Google-only accounts have no password hash; existing local records continue to require one. Google subject IDs are the stable lookup key. Later Google logins preserve edited profile names and stored email. Existing JWT subject, roles and rate limits are unchanged.

**No automatic linking:** Existing local accounts have no verified-email state, so a same-email Google login returns HTTP 409 and instructs the user to sign in with their existing account. It never merges, replaces or duplicates that account. Self-service linking is not provided; support must establish account ownership before any future linking workflow. Local passwords remain usable. Invalid/expired tokens return 401, missing credentials 400, inactive accounts 403, and unavailable configuration/service 503, with sanitized messages.

Mongoose creates the new sparse unique index through the existing index initialization. If production disables automatic index creation, apply `db.users.createIndex({ googleId: 1 }, { unique: true, sparse: true })` through your normal database migration process before enabling Google sign-in. Existing records should leave `googleId` absent, not explicitly null. No existing users need conversion.

### Frontend hosting headers

If your production frontend host applies CSP, allow Google's GIS script at `https://accounts.google.com/gsi/client` in `script-src`, `https://accounts.google.com/gsi/style` in `style-src`, and `https://accounts.google.com/gsi/` in `frame-src` and `connect-src`, alongside the existing app/API sources. Set frontend `Cross-Origin-Opener-Policy: same-origin-allow-popups` for popup compatibility. For HTTP localhost testing Google recommends `Referrer-Policy: no-referrer-when-downgrade`; use `strict-origin-when-cross-origin` in production. These are **frontend document** headers; the backend serves JSON and its existing security headers remain unchanged. Check Google's setup guide when configuring your hosting platform.

### Validation

```sh
cd backend
npm test
npm run test:auth:google
node scripts/testAuthFlow.js

cd ../frontend
npm test
npm run lint
npm run build
```

Backend unit tests mock only test dependencies and cover invalid/missing/expired/wrong-audience credentials, verified claims, creation, repeat login, conflicts, inactive accounts, uniqueness and local login. `test:auth:google` uses real MongoDB, HTTP and DataSutra JWTs with **Google verification explicitly mocked**; it creates uniquely named temporary users and removes them. It checks actual index enforcement, `/me`, profile editing and password compatibility. Frontend tests mount the real pages and AuthProvider with test-only GIS/HTTP mocks and check button rendering, context updates, dashboard redirect, refresh, logout and errors. These tests do **not** prove real Google account sign-in.

For a live check after configuring the client: open `http://localhost:5173`, choose Continue with Google, select an authorized account, confirm the dashboard name/email/initials, refresh, edit your profile, log out, and sign in with Google again. Test Signup too. A matching pre-existing local email should show the conflict message. The browser account selection/consent requires the account owner. Do not paste tokens into logs, screenshots, or bug reports.

## Google configuration troubleshooting and editable profiles

The message "Google sign-in is not configured on the server" comes from the backend, not Vite. Both processes load environment variables at startup. After editing the files, restart old processes. `npm run dev` in the backend now watches both `src` and `.env`; production still uses startup environment configuration. Vite's root and env directory are explicitly set to the frontend directory. It reads `VITE_GOOGLE_CLIENT_ID` directly and loads GIS before initializing the button. Never print either OAuth configuration or returned tokens to diagnose it.

The frontend now fails if its selected port is occupied instead of silently moving off the Google-authorized origin. To deliberately use another port, run `npm run dev -- --port 5174` and add that **exact origin** to Google Cloud's Authorized JavaScript origins. The development API accepts only explicit configured origins or HTTP(S) loopback origins (`localhost`, `127.0.0.1`, `[::1]`) at other ports. Production requires exact configured origins; wildcard CORS is not accepted. Google's own authorized-origin check is never bypassed.

Edit Profile now supports the existing `name`, `email`, and `avatar` fields. Local email changes require the current password, validate/normalize the new address, enforce the unique email index, and update the login identifier atomically. The app has no email-delivery/verification infrastructure; it does not claim to verify ownership of the new address. Automatic Google linking remains disabled. Google-linked emails remain read-only; their stable subject and provider cannot be edited. HTTPS avatar URLs can be set or removed; the backend does not fetch them. Role, ID, password hash, provider, timestamps and session state are never accepted as profile edits. Password changes are not currently supported, so there is no Change Password form.

The profile request allowlist is `name`, `email`, `avatar`, plus `currentPassword` solely for email-change authorization (never persisted or returned). Profile requests have the existing authentication rate limit. The UI sends only changed fields, disables unchanged/pending saves, supports Cancel, and updates AuthContext and its existing session cache after success. `/auth/me` and subsequent login reload the persisted profile.

# DataSutra repair and validation report

Completed 27 September 2026 in `D:\Datasutra-work\Datasutra-fixed\Datasutra-main`.
The working MongoDB connection and environment configuration are unchanged. Both
`backend/src/config/db.js` and `backend/src/config/env.js` were compared byte for
byte with the originals. No `.env` file was edited.

## Bugs found and fixes made

1. **Authenticated identity was replaced by static profile data.** Sidebar,
   topbar, and Settings imported a fictional profile. Dashboard routes were not
   protected, startup did not hydrate the user, and Sign Out only navigated.
   Added a shared AuthProvider, validated `/auth/me` hydration before rendering
   protected pages, real user/initials throughout, and token/user cleanup on
   logout or protected API 401 responses (including export requests). Network
   and server errors show a retry screen without treating them as bad credentials.
   Incomplete login/register responses cannot persist a token. Backend auth
   already used MongoDB, bcrypt, and JWT; malformed JWT subjects now also return
   401 rather than falling through to a database cast error.

2. **Demo data appeared throughout normal application flows.** Removed mock
   imports and all runtime mock data, fake notifications/review counts, fabricated
   quality metrics, sample file buttons, format-specific fictional reports,
   simulated progress, fast-forward/pause controls, and fictional landing-page
   rows. Dashboard, dataset lists, history, preview, results, and review now use
   backend data and empty states. Dashboard also incorrectly expected the dataset
   list under `data.datasets`; it now reads the actual `data` array. Job lists
   fetch all backend pages so dashboard totals are not limited to the first page.
   `mockData.js` was deleted only after its consumers were replaced. The explicit
   backend `seed:demo` developer command remains; startup and auth never invoke it.
   Setup documentation now directs users to register their own accounts.

3. **Upload/preview response contracts and state were inconsistent.** Upload
   and JSON import now require `res.data.id`; GET dataset reads `res.data`.
   Selection/removal clears the previous uploaded ID, controls are disabled
   during upload, and Continue requires a successful upload. Dataset IDs persist
   in route query parameters. Preview fetches dataset metadata, parses when
   uploaded, refreshes metadata, and loads actual preview rows. Shared in-flight
   requests avoid duplicate parsing from StrictMode mounts. Failed/processing
   states and invalid responses produce clear errors, never replacement records.

4. **Preview columns and provenance were fabricated.** Removed hard-coded
   schemas and fake document metadata. Columns now come directly from preview
   headers, preserving their order/case, including legitimate columns named `id`.
   Search and pagination operate on actual preview rows. The interface explicitly
   states the preview is capped at the first 100 rows.

5. **File picker clicks bubbled into a second picker activation.** Removed the
   drop-zone click handler. The Choose File button now opens the input directly
   from one user activation and stops propagation. Drag/drop remains available.

6. **Errors were silently swallowed or displayed as successful fake work.**
   Dashboard/history requests now show errors and retry controls. API failures
   produce development diagnostics without logging request credentials. Export
   failures propagate their backend message; the backend no longer silently
   exports a truncated preview when source parsing fails or the source file is
   missing. Export review-field names containing underscores are preserved.

7. **Several controls claimed behavior that was not implemented.** Settings
   previously displayed fake organization/API keys and claimed to save without
   calling any endpoint. It now displays the real, read-only account profile.
   Cleaning configuration now exposes the actual supported cleaning modes rather
   than ignored per-rule switches. Deterministic cleaning is the default. Normal
   API requests cannot select the simulated AI provider; AI mode requires a real
   configured provider/key. The test-only provider remains for developer tests.

8. **Remote JSON API custom key-header names were discarded.** Passed the
   existing `apiKeyHeader` field through controller and service to the importer.

9. **Development API routing depended on port 5173.** Default requests now use
   the same-origin `/api/v1` path through Vite; `VITE_API_URL` remains supported.
   Added optional `API_PROXY_TARGET` for isolated testing, defaulting to the
   existing port-5000 backend. Saved CORS settings were not changed.

10. **Sentry diagnosis.** No Sentry initialization, DSN configuration, SDK import,
    or dependency exists in this project's frontend/backend source or manifests.
    No Sentry error appeared in the final browser validation. There is therefore
    no initializer here to conditionally wrap, and no SDK was added. The source
    of the originally reported DSN error remains unverified.

## Validation and outcomes

Commands were run from the indicated project subdirectory:

```powershell
# backend
npm install
$env:PORT='5001'; npm start
node scripts/testRealDataFlow.js
# The same regression script is available as:
npm run test:real-data
npm audit --json

# frontend
npm install
npm run build
npm run lint
npm test
# Equivalent test invocation:
node --test --test-isolation=none tests/realData.test.js
```

- Both dependency installations succeeded.
- Updated backend started on port 5001 and connected to Atlas database `datasutra`.
  The original service on port 5000 also returned HTTP 200 with database connected.
- **27 real backend integration checks passed:** health/database, registration
  persisted to MongoDB, login/JWT, current user identity, password omission,
  invalid/missing/expired tokens, malformed JWT subjects, empty accounts, upload
  response shape, GET dataset, parsing, exact CSV headers/values, owner isolation,
  rejection of simulated AI, deterministic cleaning/report/export, malformed CSV
  errors, and persisted parse failure.
- **7 frontend regression tests passed:** direct dataset response shape, shared
  parsing requests, dynamic headers including `id`, parse errors, missing ID and
  failed dataset, empty real previews, 401 state cleanup including exports,
  server-error session retention, and incomplete-auth-response rejection.
- Final production build passed. Final lint passed with no warnings/errors.
- Modified backend JavaScript modules passed `node --check`.
- Browser checks passed: real name/email/initials in sidebar/topbar/profile;
  session hydration after reload; empty dashboard for a new account; actual file
  picker selection; upload and preview URL; exact `Name,Age,City,Salary` columns
  and Yash/Rahul rows; persisted preview reload; cleaning and real results;
  sign-out and protected-route redirect to login. The final validation tab had
  no console warnings/errors, including no Sentry DSN or file-activation warning.
- Final case-insensitive search of `frontend/src` found no requested demo-data
  strings or mock references. Wider-tree matches are confined to explicit seed
  utilities, existing test fixtures, and explanatory documentation.
- All generated integration/browser accounts, datasets, jobs, audit entries,
  uploaded test files, and the temporary browser credential file were removed.
  Existing users/data were not removed. Temporary servers on 5001/5174 were
  stopped; the original server on 5000 was left running.

Atlas initially exceeded the application's existing five-second handshake
limit when the standalone test connected. The regression script uses a
30-second **test-only** connection timeout; application MongoDB settings were
not changed. Windows sandbox child-process restrictions required rerunning
Vite build/dev commands with approved execution permissions. Browser tests used
port 5174 and a process-local test CORS origin for that port.

## Remaining limitations

- `npm audit --json` against the advisory registry confirms one existing
  high-severity dependency finding for `xlsx` (prototype pollution and ReDoS
  advisories). npm reports `fixAvailable: false`. Dependency migration was not
  mixed into these auth/data-flow repairs. This remains unresolved.
- The previously reported Sentry error was not reproducible and its source
  is not present in this codebase.
- Profile editing/preferences and Google sign-in remain unimplemented; the UI
  no longer pretends to save profile settings. Real account details are read-only.
- Preview is intentionally bounded to 100 source rows; result preview to 50.
  AI-assisted mode requires a real server-side provider/key. The JSON API
  header forwarding was inspected but not tested against an external service.
- Restart your existing backend/frontend development processes to load the
  changed code. Their saved settings still target the usual backend port 5000.

## Files changed

- **Updated:** `frontend/src/App.jsx`
- **Added:** `frontend/src/auth/AuthContext.jsx`
- **Added:** `frontend/src/auth/context.js`
- **Updated:** `frontend/src/components/DataTable.jsx`
- **Updated:** `frontend/src/components/FileUploader.jsx`
- **Updated:** `frontend/src/components/QualityChart.jsx`
- **Added:** `frontend/src/components/RequestError.jsx`
- **Updated:** `frontend/src/components/Sidebar.jsx`
- **Updated:** `frontend/src/components/Topbar.jsx`
- **Removed:** `frontend/src/data/mockData.js`
- **Updated:** `frontend/src/layouts/DashboardLayout.jsx`
- **Updated:** `frontend/src/pages/CleaningConfiguration.jsx`
- **Updated:** `frontend/src/pages/CleaningHistory.jsx`
- **Updated:** `frontend/src/pages/CleaningProgress.jsx`
- **Updated:** `frontend/src/pages/CleaningResults.jsx`
- **Updated:** `frontend/src/pages/Dashboard.jsx`
- **Updated:** `frontend/src/pages/DataPreview.jsx`
- **Updated:** `frontend/src/pages/Landing.jsx`
- **Updated:** `frontend/src/pages/Login.jsx`
- **Updated:** `frontend/src/pages/Register.jsx`
- **Updated:** `frontend/src/pages/ReviewSuggestions.jsx`
- **Updated:** `frontend/src/pages/Settings.jsx`
- **Updated:** `frontend/src/pages/UploadDataset.jsx`
- **Updated:** `frontend/src/services/api.js`
- **Added:** `frontend/src/services/datasets.js`
- **Added:** `frontend/src/services/jobs.js`
- **Updated:** `backend/src/controllers/dataset.controller.js`
- **Updated:** `backend/src/middleware/auth.middleware.js`
- **Updated:** `backend/src/services/dataset.service.js`
- **Updated:** `backend/src/services/export.service.js`
- **Updated:** `frontend/package.json`
- **Updated:** `frontend/vite.config.js`
- **Added:** `frontend/tests/realData.test.js`
- **Updated:** `backend/package.json`
- **Updated:** `backend/README.md`
- **Added:** `backend/scripts/testRealDataFlow.js`
- **Updated:** `FIXES_APPLIED.md`

The production `frontend/dist` output was also regenerated. A source backup is at `D:\Datasutra-work\datasutra-before-debug`.

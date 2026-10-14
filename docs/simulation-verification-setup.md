# Local simulation verification setup

Checked 14 October 2026. This setup uses only the fictional jury scenario, a loopback Firestore emulator and deliberately unavailable Gemini. It provides no live supplier or model evidence.

## Confirmed tooling

- Node.js 24.11.1 and installed application dependencies are available.
- The pre-existing Docker container `hotel-price-hunter-firestore`, labelled `com.hotel-price-hunter.owner=runtime`, is already running and exposes `127.0.0.1:8081`. A TCP probe reached it. No new emulator was started for this verification.
- The local `.env` selects `demo-hotel-price-hunter`, `127.0.0.1:8081`, port 8080 and `http://localhost:8080`; Gemini model and location are empty. The commands below override relevant configuration explicitly and do not load `.env`.
- The in-app browser runtime cannot initialise: importing its runtime fails with `EPERM` before browser selection. The installed Playwright CLI 0.1.21 also cannot launch Chrome inside the sandbox, but works in normal Windows PowerShell with an isolated temporary browser profile.
- A reusable isolated session, `hph-simulation-qa`, was opened at `about:blank`. It does not use a personal browser profile. Application startup and behavior checks remain pending until implementation is ready.

## Full test suite with actual local persistence

Run in the project directory. No live model requests are made by this suite; adapter tests inject deterministic test responses.

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-hotel-price-hunter'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:RUN_FIRESTORE_INTEGRATION='1'
$env:NODE_ENV='test'
Remove-Item Env:K_SERVICE,Env:STORAGE_MODE,Env:GEMINI_MODEL,Env:GOOGLE_CLOUD_LOCATION -ErrorAction SilentlyContinue
node --test tests/*.test.mjs
```

Unlike the default test invocation, the integration flag includes cross-client Firestore persistence and the HTTP server restart/isolation checks. Report actual passed, failed and skipped totals from the completed run.

## Start the application only after implementation is ready

Keep this command session alive and retain its session/process identity for cleanup. Confirm `/health` reports `storage: firestore-emulator` and `model: unconfigured` before browser actions.

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-hotel-price-hunter'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:PORT='8080'
$env:APP_ORIGIN='http://localhost:8080'
$env:NODE_ENV='development'
Remove-Item Env:K_SERVICE,Env:STORAGE_MODE,Env:GEMINI_MODEL,Env:GOOGLE_CLOUD_LOCATION -ErrorAction SilentlyContinue
node app/server.mjs
```

Use `http://localhost:8080` consistently. Mutation requests require this exact origin and the application's own visitor/CSRF protection. Browser checks use the public UI and do not extract identity tokens, personal cookies, or browser storage.

## Browser checks

Use normal Windows PowerShell for the existing isolated session. If it has already closed, open the same named session with `playwright-cli -s=hph-simulation-qa open about:blank --browser=chrome`.

```powershell
playwright-cli -s=hph-simulation-qa goto http://localhost:8080
playwright-cli -s=hph-simulation-qa run-code --filename=tests/ui.browser.mjs
playwright-cli -s=hph-simulation-qa run-code --filename=tests/ui-city.browser.mjs
```

The checked-in browser harnesses create fresh isolated contexts for their cases, exercise actual local persistence, collect browser errors, and save ignored screenshots under `.playwright-cli/`. The unavailable-advice case deliberately receives local `503 ADVICE_UNAVAILABLE`; it is not a live model attempt. Add the new simulation-specific UI checks alongside these existing regression cases, including refresh persistence, failure-stage safety, retry/double-click behavior, and the small-screen layout.

## Cleanup

```powershell
playwright-cli -s=hph-simulation-qa close
```

When leaving the application available for user review, retain its command session and report that session identity. Otherwise stop only the application command session created for this verification. Preserve the pre-existing emulator container and unrelated local processes; do not use global browser or container cleanup commands. Do not redeploy, modify cloud resources, or run the private-cloud model retest script as part of these local checks.

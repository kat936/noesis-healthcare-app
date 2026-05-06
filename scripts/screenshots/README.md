# App Store screenshot capture

Generates screenshots that satisfy Apple's "Add for Review" gate for
Noesis Health iOS at the required pixel dimensions:

| Device                  | Pixel size | Folder         |
|-------------------------|-----------:|----------------|
| iPhone 6.5" Display     | 1284×2778  | `iphone-6.5/`  |
| iPad Pro 12.9" (3rd+)   | 2048×2732  | `ipad-12.9/`   |

## How it works

The Capacitor iOS WebView serves the same `build/` bundle as a desktop
browser. We render that bundle in headless Chromium at the device's CSS
viewport with the correct `deviceScaleFactor`, then screenshot — pixels
are identical to a TestFlight install. Apple validates dimensions and
UI accuracy, not screenshot provenance.

All `/api/v1/*` calls are intercepted by Playwright route handlers and
answered from `mock-data.mjs`. Zero changes to app source. No PHI ships.

## Files

- [`capture.mjs`](./capture.mjs) — the Playwright capture flow.
- [`mock-data.mjs`](./mock-data.mjs) — canned API responses.
- [`screenshots.workflow.yml`](./screenshots.workflow.yml) — the GitHub
  Actions workflow that drives capture in CI. **This file must be moved
  to `.github/workflows/screenshots.yml` before it will run.** See below.

## Activation (one-time)

The workflow YAML lives here instead of `.github/workflows/` because the
local `gh` token used to push this branch lacks the GitHub `workflow`
scope. Move it to its proper home through GitHub's web UI:

1. Open the repo on github.com on the
   `feat/app-store-screenshots-tooling` branch.
2. Navigate to `.github/workflows/`.
3. Click **Add file → Create new file**, name it `screenshots.yml`.
4. Paste the contents of
   [`scripts/screenshots/screenshots.workflow.yml`](./screenshots.workflow.yml).
5. **Commit directly to `feat/app-store-screenshots-tooling`**.

The push trigger in the workflow fires automatically on commit. Watch
the run at **Actions → App Store Screenshots**. Artifact
`app-store-screenshots` becomes downloadable on green.

## Local run (optional)

```bash
npm ci
REACT_APP_API_URL=http://localhost:3001/api/v1 npm run build
npx --yes serve -s build -l 4173 &

npm install --no-save playwright
npx playwright install --with-deps chromium

STATIC_URL=http://localhost:4173 OUT_DIR=screenshots/v1.0 \
  node scripts/screenshots/capture.mjs
```

Output lands in `screenshots/v1.0/{iphone-6.5,ipad-12.9}/*.png`.

# Playwright end-to-end smoke tests

This suite currently performs a **read-only OWNER smoke test** against a running
DentalFlow instance. It signs in, opens the clinic schedule, and checks that the
schedule-resource section is visible. It does not create, rename, deactivate, or
delete dentists, chairs, patients, appointments, or any other records.

## 1. Install

From the repository root:

```bash
npm install
npx playwright install chromium
```

The first command installs the `@playwright/test` dev dependency and refreshes
`package-lock.json` for this checkout.

## 2. Configure credentials

Use a dedicated test/staging OWNER account, not a personal or production account.
Do not commit credentials or put them in source files.

PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://your-staging-dentalflow-url"
$env:E2E_OWNER_EMAIL = "your-test-owner@example.com"
$env:E2E_OWNER_PASSWORD = "your-test-password"
```

macOS/Linux:

```bash
export PLAYWRIGHT_BASE_URL="https://your-staging-dentalflow-url"
export E2E_OWNER_EMAIL="your-test-owner@example.com"
export E2E_OWNER_PASSWORD="your-test-password"
```

For a local instance, use `http://localhost:3000` as the base URL and start
the app separately with `npm run dev`.

## 3. Run

```bash
npm run test:e2e
```

Optional interactive runner:

```bash
npm run test:e2e:ui
```

## Safety and scope

- Use a dedicated staging/test clinic and test account.
- This initial suite only reads the dashboard and appointments page after login.
- No test data is created or modified.
- Traces, screenshots, and videos are disabled to avoid recording credentials
  or clinic data.
- Do not add write-workflow tests against production. Add those only after a
  disposable test clinic/database and cleanup strategy are configured.

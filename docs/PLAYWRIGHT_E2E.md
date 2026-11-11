# Playwright end-to-end tests

The suite has two levels:

- Read-only OWNER and STAFF browser smoke tests. OWNER verifies the clinic setup checklist and schedule. STAFF verifies routine patient/scheduling access, absence of owner-only navigation, and server-side denial of the team settings route.
- An opt-in schedule-resource management test that creates uniquely named dentists/chairs, checks duplicate rejection, renames resources, and deactivates them.

## 1. Install

From the repository root:

```bash
npm ci
npx playwright install chromium
```

## 2. Configure the read-only smoke test

Use a dedicated test/staging OWNER account. Do not commit credentials or put them in source files.

PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://your-staging-dentalflow-url"
$env:E2E_OWNER_EMAIL = "your-test-owner@example.com"
$env:E2E_OWNER_PASSWORD = "your-test-password"
```

For a local instance, use `http://localhost:3000` and start the app separately with `npm run dev`.

## 3. Configure and run the read-only STAFF smoke test

Use a dedicated staging STAFF account that belongs to the same staging clinic as the OWNER test account. Do not reuse a production account or commit credentials.

PowerShell:

```powershell
$env:E2E_STAFF_EMAIL = "your-test-staff@example.com"
$env:E2E_STAFF_PASSWORD = "your-test-password"
```

The STAFF browser test checks the clinic role label, confirms owner-only checklist/team/billing navigation is absent, directly requests the team settings URL and verifies the owner-only page is not rendered, then confirms patient-directory and appointment-schedule access.

Run both configured read-only role tests:

## 4. Run the read-only smoke tests

```bash
npm run test:e2e
```

Optional interactive runner:

```bash
npm run test:e2e:ui
```

## 5. Enable schedule-resource write tests (disposable staging clinic only)

These tests create four uniquely named resources, exercise duplicate creation and duplicate rename rejection, rename two resources, and deactivate all four. They do not delete records. Use a disposable staging clinic that can be reset; never use production or a clinic containing real operational data.

PowerShell:

```powershell
$env:E2E_RESOURCE_TEST_CLINIC_ID = "the-clinic-uuid-after-login"
$env:E2E_RESOURCE_TEST_ALLOWED_HOST = "your-staging-hostname.example"
$env:E2E_ALLOW_RESOURCE_MUTATIONS = "1"
npm run test:e2e
```

The test requires all of the following before it runs:

- OWNER email and password.
- The clinic UUID to match the clinic reached after sign-in.
- The configured base URL hostname to exactly match `E2E_RESOURCE_TEST_ALLOWED_HOST`.
- The explicit opt-in `E2E_ALLOW_RESOURCE_MUTATIONS=1`.
- The hostname must not be `dental-flow-brown.vercel.app`.

If any required setting is missing, the write test is skipped. The exact-host allowlist is an additional guard against accidentally running writes against the wrong deployment.

## Coverage and limitations

- Dentist and chair creation.
- Duplicate name/label rejection on create.
- Dentist and chair rename.
- Duplicate name/label rejection on rename.
- Deactivation of both resource types.
- Cross-clinic ID scoping is covered by repository-level tests; the browser test does not attempt to tamper with another clinic's identifiers.
- The write test leaves the uniquely named resources inactive. Reset the disposable clinic after the run if you want a clean fixture.
- Traces, screenshots, and video are disabled to avoid recording credentials or clinic data.
- Do not run write-workflow tests against production.

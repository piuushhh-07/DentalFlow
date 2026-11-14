# DentalFlow operational runbook

This runbook is for the application operator. It is not a patient-facing
support policy, an SLA, or a substitute for the clinic's privacy and incident
obligations. Do not place patient names, phone numbers, clinical notes,
insurance identifiers, credentials, access tokens, or database URLs in
support tickets or deployment logs.

## 1. Availability and readiness

The public `GET /api/health` endpoint performs a read-only PostgreSQL
`SELECT 1` through the application's Prisma runtime connection.

- HTTP `200`: the application route is responding and the database probe
  succeeded. Response body reports `status: "ok"`.
- HTTP `503`: the database probe failed. Response body reports
  `status: "degraded"` and `database: "unavailable"`.
- Responses are not cacheable. The endpoint does not expose exception text,
  hostnames, credentials, SQL, or patient/clinic data.

The endpoint is a readiness signal, not complete dependency monitoring. It
does not verify Supabase Auth, Storage, WhatsApp/Meta, Razorpay, scheduled
jobs, backups, or restore readiness. A successful response is not proof that
every clinic workflow is healthy.

## 2. Signals to review

Use the Vercel deployment's Runtime Logs and deployment status:

- HTTP 5xx rate and repeated route failures: identify the route, deployment,
  and time window before investigating.
- `[server-timing]`: records named server operations, elapsed milliseconds,
  and success/error outcome. On errors it records the error class, not the
  exception message.
- `[slow-query]`: emitted for Prisma queries at or above
  `DENTALFLOW_SLOW_QUERY_THRESHOLD_MS` (default `300` ms). It includes
  duration, a query-shape hash, and target only. It intentionally excludes SQL
  parameters and user/clinic identifiers.
- Error-boundary `Support reference`: preserve the digest and deployment
  timestamp so the corresponding server-side error can be located.

Do not lower the slow-query threshold in production without considering log
volume. Do not add SQL text, query parameters, request cookies, tokens, or
patient details to diagnostic logs.

## 3. First-response triage

1. Record the time (include timezone), affected route, deployment URL, browser,
   visible error text, and support reference/digest if present.
2. Check the Vercel deployment state and request `/api/health`.
3. If readiness returns 503, inspect Vercel runtime logs and Supabase project
   health/connection status. Do not run ad-hoc production SQL or migrations.
4. If readiness returns 200 but one route fails, correlate its
   `[server-timing]` operation and error digest with the same deployment and
   time window.
5. For authentication failures, verify Supabase Auth availability and the
   configured site URL/redirect allow list. Never ask a user to share a
   password, magic link, cookie, or access token.
6. For insurance-file failures, verify the private Storage bucket and
   membership/claim-scoped access configuration. Never make the bucket public
   as a workaround.
7. For WhatsApp or payment-provider failures, distinguish provider acceptance
   from actual delivery/settlement. Do not manually replay webhooks or
   scheduled jobs without checking idempotency and provider state.
8. Escalate recurring or cross-clinic symptoms to the application operator.
   Preserve logs and timestamps; do not export patient records for debugging.

## 4. Deployment checklist

Before promoting a release:

- Confirm the intended Git commit and that GitHub CI passes unit tests,
  typecheck, lint, Prisma validation, formatting, and production build.
- Review the Vercel preview deployment and its build/runtime logs.
- Confirm the preview uses the intended non-production Supabase project and
  environment-specific secrets; never copy production credentials into
  preview.
- Check `/api/health` on the preview and exercise sign-in, clinic selection,
  patient search, appointment calendar, and one synthetic follow-up workflow.
- Review migration files separately. Verify target project identity and
  backup/rollback plan before any migration. Do not use production as a test
  target.
- After production promotion, check deployment readiness, `/api/health`,
  authentication, a clinic-scoped read, and runtime logs. Use synthetic or
  already-authorized operational checks only; do not create test patient data
  in a live clinic.

If a release causes a regression, use Vercel to promote the last known-good
deployment. Treat database migrations separately: do not assume reverting the
application reverses a migration or restores data. Prefer a reviewed forward
fix; any production restore or destructive operation requires explicit
approval and a verified recovery plan.

## 5. Incident handling and communication

- Contain the issue without weakening authentication, tenant isolation, RLS,
  Storage privacy, or audit history.
- Capture deployment ID/commit, first-seen time, affected route, HTTP status,
  error digest, and relevant redacted log entries.
- Determine whether the incident affects availability, confidentiality,
  integrity, or only one clinic workflow. Do not infer that no data was
  exposed solely because the UI returned an error.
- Escalate suspected unauthorized access, cross-clinic exposure, lost or
  altered clinical/financial records, or exposed credentials immediately to
  the responsible operator and obtain appropriate legal/privacy advice.
- Keep an incident timeline and record containment, recovery, and follow-up
  actions. Preserve audit evidence; do not delete logs to hide an incident.

## 6. Current operational gaps

This repository now provides a database readiness probe, privacy-conscious
server timing/slow-query logs, and application error fallbacks. This PR does
not configure an external uptime monitor, alert routing, a staffed support
inbox, on-call coverage, backup/PITR, or a restore drill. Those require named
owners and deployment/provider configuration and must be verified separately
before real-patient launch.

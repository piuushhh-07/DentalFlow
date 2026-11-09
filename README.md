# DentalFlow

DentalFlow is a focused workspace for independent dental clinics in India.
It helps teams keep multi-visit treatment follow-ups and preventive recalls
moving; it is not a full practice-management system.

## Requirements

- Node.js 20 or newer
- npm

## Local setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Replace the clearly
marked placeholders in `.env.local` with your own development credentials
before connecting external services. Never commit `.env.local` or real
credentials.

`NEXT_PUBLIC_SITE_URL` must be the exact public origin used for Supabase Auth
redirect allow-list entries. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; it is
used only to send owner-authorized staff invitations. Meta WhatsApp credentials
are optional until automatic reminders are explicitly configured.

For the local no-database demo, keep `NEXT_PUBLIC_DENTALFLOW_DEMO_MODE=true`
in `.env.local` (or leave it unset in development to use the default local demo
mode) and visit [http://localhost:3000/demo](http://localhost:3000/demo).
The demo uses a fictional clinic dataset stored in browser local storage only,
so it never touches Supabase or the production database.

The demo is interactive: add fictional patients and appointments, detect
clinician/chair scheduling conflicts, advance appointment statuses, connect
visits to treatment-plan stages, record plan decisions, manage recalls and
follow-ups, and prepare consent-gated WhatsApp message snapshots. Changes stay
in the current browser and can be removed with **Reset demo**. WhatsApp chats
open only after an explicit click; opening a chat does not mean the message was
sent or delivered.

## Scripts

| Command                     | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `npm run dev`               | Start the local Next.js development server              |
| `npm run build`             | Create the production build                             |
| `npm run start`             | Run the production build locally                        |
| `npm run lint`              | Run the Next.js ESLint checks                           |
| `npm run typecheck`         | Check TypeScript without emitting files                 |
| `npm run format`            | Format supported source and configuration files         |
| `npm run format:check`      | Check formatting without changing files                 |
| `npm test`                  | Run authorization and clinic workflow unit tests        |
| `npm run db:generate`       | Generate Prisma Client                                  |
| `npm run db:validate`       | Validate the Prisma schema                              |
| `npm run db:migrate:deploy` | Apply checked-in migrations using the direct connection |

## Project structure

```text
src/
  app/                 Next.js App Router routes and global styles
  components/
    layout/            Shared application shell and navigation
    ui/                shadcn/ui-compatible reusable primitives
  features/
    dashboard/         Dashboard route-level feature components
    auth/              Supabase sign-in and clinic membership authorization
    onboarding/        Verified first-run clinic setup
    patients/          Clinic-scoped patient records
    treatments/        Treatment plans and multi-visit schedules
    estimates/         Versioned treatment estimates and printable quotations
    prescriptions/     Clinic-scoped, append-only digital prescriptions
    recalls/            Preventive recall cycles
    insurance/         Clinic-scoped insurers, policies, claims and private documents
  lib/                 Shared utilities
prisma/
  migrations/          Versioned PostgreSQL migrations
  schema.prisma        Clinic-scoped data model
middleware.ts          Supabase session refresh and route protection
```

Digital prescriptions are finalized as historical records. A correction creates
a linked amendment and does not overwrite the original. The prescription page
uses the browser print dialog for printing or saving a PDF; medicine details
and clinical text are entered and confirmed by the clinic author, not generated
by DentalFlow.

Treatment quotations are immutable price snapshots linked to the existing
clinic, patient, treatment plan, and optional procedure catalogue entries.
Sending, acceptance, rejection, expiry, and conversion are recorded with their
actor. A correction creates a new estimate version. Conversion records the
accepted quotation against its existing treatment plan without creating a
charge, payment, or ledger entry; actual treatment finance remains in the
existing financial workflow.

The project uses Next.js 14 App Router, strict TypeScript, Tailwind CSS, and
shadcn/ui conventions. `components.json` configures shadcn/ui component
generation, and the shared `cn` utility is available at `@/lib/utils`.
Components are added locally as needed rather than pulling in a component
runtime.

## Environment variables

`.env.example` contains placeholders only. Copy it to `.env.local` and configure
the values for your development environment. Public Supabase settings use the
`NEXT_PUBLIC_` prefix; keep private database credentials server-side and out of
source control.

`DATABASE_URL` must use the Supabase transaction pooler on port `6543` with
`pgbouncer=true` and a small connection limit for serverless runtime access.
`DIRECT_URL` must use the direct database connection or Supabase session
pooler on port `5432`; Prisma Migrate uses it for schema changes. Do not use
the transaction pooler for migrations. Copy the exact host, username and TLS
parameters from the Supabase dashboard for your project and network. Do not
expose either database URL to browser code.

Public appointment booking requests are limited to 3 per phone number, per
clinic, in a rolling 60-minute window by default. The optional
`PUBLIC_APPOINTMENT_RATE_LIMIT_MAX_REQUESTS` and
`PUBLIC_APPOINTMENT_RATE_LIMIT_WINDOW_MINUTES` settings are server-only. For
local development, set the first to `20` in `.env.local`; production keeps the
default of 3 unless its server-side environment is explicitly configured.
Invalid values fall back to the defaults. Do not use `NEXT_PUBLIC_` for these
settings.

Prisma is pinned to version 6.19.2. Its schema uses the Prisma 6
`url`/`directUrl` datasource settings; it does not use Prisma 7's config-file
datasource API.

## Authentication and clinic access

Authentication uses Supabase Auth with server-side `getUser()` verification.
Middleware refreshes the cookie session and protects application routes;
passwords and auth tokens are never read from client-submitted claims. A
successful sign-in creates or updates the user's local profile. A verified,
unexpired owner invitation may activate a `STAFF` membership after the invited
email address is confirmed.

A user may belong to multiple clinics. Each clinic-scoped server operation must
receive a clinic selection, resolve it together with the authenticated
Supabase user ID against `clinic_memberships`, and use the returned membership
and database role as its authorization scope. The submitted clinic ID is only a
selection hint: a missing or mismatched membership is denied, and client role
values are never accepted. `requireClinicMembership` and `requireClinicRole`
are the shared server-side guards for clinic data operations.

The profile UUID mirrors the verified Supabase Auth user UUID. Membership is
unique per `(userId, clinicId)`, allowing one user to have distinct roles in
different clinics while preventing duplicate memberships in the same clinic.
Owners can invite staff from **Team**. Invitations expire after seven days;
memberships are created only after the invitee verifies the invited email.
Owners may remove staff memberships; client-supplied roles are never trusted.
`OWNER` manages clinic administration, team access and billing, while `STAFF`
uses the allowed clinic workflows.
All application tables have row-level security enabled without client-facing
policies. Browser code uses Supabase Auth only; clinic data access goes through
the server-only Prisma client and the verified membership guards.

## Clinic onboarding

An authenticated user without a clinic membership is sent to `/onboarding`.
The server verifies the Supabase user, validates and normalizes the clinic
phone to `+91` plus ten digits, and creates the clinic and its `OWNER`
membership together in one Prisma transaction. Clinic ID, owner user ID, and
role are taken from the verified session and server logic, never from form
fields. The first clinic setup is keyed uniquely to its authenticated creator;
retrying a completed setup returns the existing authorized clinic instead of
creating another.

Users who already have a membership are redirected to that clinic. Users with
multiple clinic memberships see `/clinics` and choose one; each clinic page
rechecks the selected membership before reading clinic details. Contact email
and address are optional; timezone defaults to `Asia/Kolkata`.

## Booking, portal, team and privacy exports

Clinic owners manage dentists and chairs from the Appointments page. Existing
appointment labels are migrated into clinic-scoped resources, while each
appointment keeps its original label snapshot. Owners can enable a public
booking URL; patients submit a preferred slot as a request, and clinic staff
must approve it before an appointment is created.

Patient portal access is opt-in per patient record and requires a clinic-
verified email address. Supabase sends a magic link; the portal exposes only
upcoming appointment details and estimates marked SENT or ACCEPTED, not
clinical notes, prescriptions, or insurance documents. Configure
`NEXT_PUBLIC_SITE_URL` in the deployment and Supabase redirect allow list.

Only owners can invite or remove staff. Configure the server-only
`SUPABASE_SERVICE_ROLE_KEY` to send invitations; memberships are activated
after the invitee verifies the invited address. The owner-only **Export patient
data** action downloads a clinic-scoped JSON export and records an audit event.
It exports structured database records, not the contents of private storage
objects.

Message logs retain the sender membership, patient and clinic-scoped visit or
recall, recipient phone, template name, rendered message snapshot and manual
confirmation timestamp. Opening the WhatsApp chat alone does not create a
message log. `OPENED_IN_WHATSAPP` is retained only for legacy records and does
not claim delivery or read confirmation. Patient phone deduplication is scoped
to `(clinicId, normalizedPhone)`.

## Preventive recalls and date storage

Preventive recalls are explicitly created and managed by a clinic member;
loading a page never generates another recall cycle. Active duplicate prevention
is scoped to the same clinic, patient, recall type, custom label, and due date.
A later due date is a separate legitimate cycle. Completed records
remain available as history.

Treatment visit and recall due dates are PostgreSQL `DATE` values, not
timestamps. The application treats these as clinic-local calendar dates and
converts date-input values to UTC midnight only for Prisma's JavaScript `Date`
representation. Due/overdue comparisons use the clinic's configured timezone
(currently defaulted to `Asia/Kolkata`); they do not compare UTC instants.

## Daily follow-up queue

The six dashboard tabs have these query semantics:

- **Due today** includes non-cancelled treatment visits and active recalls whose
  date equals today's date in `Asia/Kolkata`; completed records are excluded.
- **Overdue** uses the same active-status rules with a due date before the
  clinic-local date.
- **Reminder sent** includes treatment visits with status `REMINDER_SENT` and
  active recalls with a clinic-scoped log explicitly reported as manually
  sent. Opening WhatsApp alone is not counted. It can include future-due or
  overdue items; WhatsApp does not verify delivery.
- **Confirmed** and **No response** include treatment visits with those exact
  statuses. Recalls do not have equivalent statuses.
- **Completed** includes completed visits and recalls; cancelled visits/recalls
  and paused recalls are excluded.

Date-based tabs intentionally overlap status tabs, so an overdue confirmed
visit appears in both **Overdue** and **Confirmed**. Every tab filters in SQL
after the server verifies the user's clinic membership; search and pagination
are applied to the combined treatment/recall result set in the database.

## Database setup

After configuring Supabase connection strings:

```powershell
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
```

Apply migrations only against the intended Supabase project. The initial
migration creates the DentalFlow application tables and constraints; Supabase
Auth's managed tables are not recreated or modified.

The SQL migrations include PostgreSQL checks, partial unique indexes and RLS
statements that Prisma's datamodel cannot express directly. Preserve these
migration-only constraints when changing the corresponding models.

Before enabling clinic workflows, verify against a non-production Supabase
project:

1. A signed-out request to `/` redirects to `/login`; invalid credentials do
   not establish a session; valid credentials do.
2. A valid Supabase session with no `clinic_memberships` row can see only the
   empty dashboard and cannot pass `requireClinicMembership`.
3. A membership grants only its database-stored role for that selected clinic;
   the same user can have a different role in a second clinic.
4. A patient/plan, plan/visit, or patient/recall relationship using IDs from
   different clinics is rejected by the composite foreign keys.
5. Reusing a normalized phone number in one clinic is rejected, while the same
   number in a different clinic is allowed.
6. Supabase `anon` and `authenticated` roles cannot query the application
   tables through REST because RLS is enabled and no client-facing policies
   exist.

The automated tests cover onboarding retries and authorization, Indian phone
normalization and clinic-scoped patient access, treatment visit status and date
rules, and recall validation, duplicate-cycle detection, completion,
rescheduling and clinic isolation. Database integration checks require a
separate disposable Supabase project and synthetic Auth users. Integration
tests must never use the staging or production project.

### Disposable database integration tests

Create a separate Supabase project exclusively for integration tests. It must
not contain clinic data or serve as staging/production. Create two confirmed
synthetic Auth users in that project and keep their passwords private. Create
`.env.test.local` (this filename is Git-ignored) with the following
test-project settings:

```dotenv
DENTALFLOW_TEST_PROJECT_REF=your-dedicated-project-ref
DENTALFLOW_TEST_DATABASE_CONFIRMATION=I-UNDERSTAND-THIS-IS-A-DISPOSABLE-TEST-PROJECT
DENTALFLOW_TEST_DATABASE_URL=postgresql://postgres.your-dedicated-project-ref:YOUR_PASSWORD@YOUR_POOLER_HOST:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
DENTALFLOW_TEST_DIRECT_URL=postgresql://postgres.your-dedicated-project-ref:YOUR_PASSWORD@YOUR_DIRECT_OR_SESSION_HOST:5432/postgres?sslmode=require
DENTALFLOW_TEST_SUPABASE_URL=https://your-dedicated-project-ref.supabase.co
DENTALFLOW_TEST_SUPABASE_ANON_KEY=YOUR_TEST_PROJECT_ANON_KEY
DENTALFLOW_TEST_USER_A_EMAIL=synthetic-owner-a@example.invalid
DENTALFLOW_TEST_USER_A_PASSWORD=YOUR_SYNTHETIC_USER_A_PASSWORD
DENTALFLOW_TEST_USER_B_EMAIL=synthetic-owner-b@example.invalid
DENTALFLOW_TEST_USER_B_PASSWORD=YOUR_SYNTHETIC_USER_B_PASSWORD
```

Use the exact connection username, hosts, and TLS parameters from that
project's Supabase dashboard. Do not paste these values into chat or commit
`.env.test.local`. The runner checks the explicit disposable-project
confirmation, project reference in both PostgreSQL URLs and Auth URL, expected
database and pooler ports/options, and that the target differs from the
application URLs in `.env` and `.env.local`. It then makes a read-only
connection check before any migration command. Do not weaken these checks to
make an environment pass.

Run:

```powershell
npm run test:integration:prepare
npm run test:integration
```

The prepare command runs `prisma migrate deploy` only after those checks, using
the test-only migration URL. It applies pending local migration directories
only to the verified disposable project. The integration suite refuses to run
unless all local migration directories are recorded as successfully applied.
It creates
synthetic clinics, patients, treatment, recall, message, and insurance rows
and does not delete database rows; keep the project disposable and discard it
when finished. Synthetic private test files are removed by the test cleanup
hook. The suite authenticates the two synthetic users against Supabase and
checks database-backed repository reads/writes, isolation, RLS, Storage
access, state transitions, duplicate submissions, and selected concurrent
updates. A failed cleanup is reported as a test failure.

The test database guard is not a substitute for verifying the project in the
Supabase dashboard. Confirm the displayed project reference yourself before
running `test:integration:prepare`; never point these variables at staging or
production. No integration test command is run automatically by build or
application startup.

To test Prisma Schema Engine connectivity to the validated disposable migration
datasource without applying migrations, run:

```powershell
npm run test:integration:diagnose:migrate
```

This command repeats the disposable-target and TLS checks, performs the
read-only runtime and migration-target identity checks, then runs Prisma 6's
`migrate diff` from the schema datasource to an empty schema. It verifies that
the Schema Engine can read the datasource and inspect the current schema. It does not run
`migrate deploy`, write database data, or prove that migration locking,
migration-history access, or applying migrations will succeed.

## WhatsApp reminders

The follow-up queue can open a `wa.me` chat with the patient's validated Indian
mobile number and an editable, URL-encoded reminder. Manual click-to-chat
remains available. Clinic owners can separately enable automated appointment
reminders after configuring Meta WhatsApp Business Cloud API credentials and
an approved template. Automatic messages are attempted about 24 hours before
an appointment, only when clinic automation and the patient's recorded
WhatsApp consent are both enabled.

An external scheduler must POST to `/api/cron/whatsapp-reminders` at least
hourly with `Authorization: Bearer <WHATSAPP_CRON_SECRET>`. The approved Meta
template must have three body parameters in order: patient name, clinic name,
appointment time. Delivery attempts are deduplicated and logged. A
`SENT_AUTOMATICALLY` log means Meta accepted the API request; it does not prove
delivery, reading, or patient response. Provider credentials and the scheduler
are deployment configuration and are not included in this repository.

Opening a chat does not create a message log or change a treatment visit's
status. After opening WhatsApp, a clinic member can explicitly confirm that
they sent the message. The audit log stores the verified clinic member, patient
and phone snapshot, related visit or recall, message snapshot, and confirmation
timestamp. This outcome is manually reported and is not WhatsApp-verified.
Retries with the same submission ID do not create duplicate logs. Existing
`OPENED_IN_WHATSAPP` rows remain legacy opening records and are never treated
as sent.

The default text is intentionally generic and avoids treatment or diagnosis
details. Custom messages are editable; staff should avoid including
unnecessary health information. Consent and audit behavior should be tested
against a disposable Supabase project before production use.

Patient, treatment, preventive recall and WhatsApp reminder workflows are
implemented. Clinic owners can edit the default WhatsApp reminder template
from **Templates** in the clinic navigation. Templates support
`{{patient_name}}`, `{{clinic_name}}`, `{{treatment_name}}`,
`{{visit_number}}`, `{{total_visits}}`, `{{due_date}}` and
`{{clinic_phone}}`; missing values become empty text. Dates are formatted for
Indian users in `Asia/Kolkata`. Templates accept plain text only, reject
unsupported placeholders and HTML tags, and are never evaluated as code.
The editor previews against a real patient from the selected clinic and shows
no patient preview when the clinic has no patients. Only an OWNER membership
can save or reset a template; all reads and writes are scoped to the selected
clinic. WhatsApp audit logs retain the template name and rendered message
snapshot, so later edits do not change historical records.

## Clinic reports

The Reports page shows these clinic-scoped metrics:

- **Active patients** is the current number of patient rows in the clinic.
  Patients do not currently have an archived/inactive state.
- **Pending treatment visits** counts visits in `PENDING` or `RESCHEDULED`
  status with a due date today or later, excluding cancelled treatment plans.
- **Overdue treatment visits** counts unresolved visits due before today with
  status `PENDING`, `REMINDER_SENT`, `CONFIRMED`, `RESCHEDULED` or
  `NO_RESPONSE`; completed/cancelled visits and cancelled plans are excluded.
- **Pending preventive recalls** counts `ACTIVE` recalls due today or later.
- **Overdue preventive recalls** counts `ACTIVE` recalls due before today.
- **Manually recorded WhatsApp messages** counts WhatsApp logs with
  `MANUALLY_RECORDED_SENT` and a manual confirmation timestamp in the rolling
  30-day range. It is a staff-reported action, not delivery verification.
- **Confirmed follow-ups** counts treatment visits currently in `CONFIRMED`
  status whose due date falls in the rolling 30-day range. Recalls do not have
  a confirmed status.
- **Completed treatment plans** counts plans whose every visit is complete and
  whose plan completion timestamp falls in the rolling range. This counts
  plans, not visits.

Workload cards are current snapshots as of today in the clinic timezone;
message, confirmed-visit and completed-plan activity uses the displayed
30-calendar-day range including today. Each metric uses an independently
clinic-filtered database count (no joins), preventing joined visit/message
rows from multiplying counts. Treatment-plan completion timestamps are
backfilled from `updatedAt` for plans already completed when the migration is
applied.

## Insurance management

The Insurance section tracks clinic-specific insurers/TPAs, patient policies,
cashless pre-authorizations, reimbursement claims, payments, follow-ups,
required documents and append-only activity. Estimates and submitted requests
are never treated as confirmed approvals. Claim statuses and approval amounts
are validated server-side; reimbursement submission requires patient payments
to cover the claimed amount. Patient and insurer receipts are recorded as
separate immutable payment entries, and insurer payments cannot exceed the
approved amount. Financial values use PostgreSQL `DECIMAL(12,2)` and
paise-safe integer arithmetic in application validation.

Policy and member identifiers are masked in list/detail summaries. Provider,
policy, patient, treatment-plan, claim and payment queries are scoped to the
verified clinic membership. Composite foreign keys prevent cross-clinic patient
and treatment-plan links. Insurance files use the private
`dentalflow-insurance-private` Supabase Storage bucket created by the insurance
migration, with PDF/JPEG/PNG content types and a 10 MB limit. The migration
defines authenticated membership- and claim-scoped Storage policies; files
have no public URLs. The browser uses the signed-in user's Supabase session,
not a service-role key. Do not apply the migration until it has been reviewed
and the target has been confirmed as staging.

The additive Insurance migration is
`prisma/migrations/20261016220000_insurance_management_mvp`. Review its SQL
and check the migration ledger for the intended project before applying it.
Only apply it when it is pending and after confirming the configured
`DIRECT_URL` points to the intended non-production project. The operator can
then run:

```powershell
npm run db:migrate:deploy
```

That command applies all pending checked-in migrations against the configured
`DIRECT_URL`; verify the target immediately before running it. No migration is
applied by application startup or feature pages. After applying it, verify the
private bucket and storage policies in the Supabase dashboard and run
authenticated upload/download checks using synthetic accounts from two
clinics. Database and Storage authorization must be tested in the target
environment before production use.

## Production readiness, backups and privacy

Before deployment, configure and verify Vercel environment variables
separately for each environment. Confirm the Supabase Auth site URL and
redirect allowlist, public client configuration, and server-only database
URLs. Set `DATABASE_URL` to the runtime transaction pooler, and reserve
`DIRECT_URL` for migration operations. Do not add database credentials,
service-role keys, AI provider keys, or integration-test credentials to
`NEXT_PUBLIC_*` variables. The local demo flag is development-only. Keep
`DENTALFLOW_TEST_*` values out of Vercel and use them only in a separately
verified disposable test project.

Run `npm run db:validate` and inspect `npx prisma migrate status` against the
intended database; apply reviewed migrations as a separate, explicitly
approved operation. Do not run migration commands against production until
the target and rollback plan are confirmed. The integration-test runner
requires TLS (`sslmode=require`) on both test URLs and rejects application
project references before connecting.

Select a Supabase backup/PITR plan and retention period that meet the clinic's
recovery needs. Before a production migration, ensure a recent recoverable
backup exists. Test restoration only into an isolated project, then verify
schema, constraints and application access there; never test restore
procedures against the live clinic database. Document the clinic's recovery
point/time objectives and who is authorized to perform recovery.

Configure monitoring and alerts before onboarding real clinics. At minimum,
monitor application availability and server errors, Supabase Auth and
database availability, database connection saturation, Storage usage and
upload failures, scheduled backup status, and migration outcomes. Review
Vercel and Supabase audit/operational logs without copying patient data or
credentials into third-party logs. This repository does not configure an
external error-monitoring or alerting service.

The application currently has no configurable patient-record retention
schedule, automatic deletion workflow, or verified clinic data-export and
erasure process. Define these with the clinic before launch; do not assume
database cascades or the insurance audit immutability triggers implement a
complete retention policy. Review access to clinic memberships periodically
and define an incident-response process, including escalation and breach
notification responsibilities.

The insurance document AI provider configuration is server-only. However,
the current extraction and policy-answer helpers are not connected to a
user-facing processing workflow, and source quotes are not independently
verified against extracted document text. Do not represent AI output as
verified or use it to make coverage decisions. Before enabling such a
workflow, document the provider, data location, retention and training
settings, obtain the required clinic/vendor approvals, and keep a human
review gate. Never send real insurance or patient documents to an AI provider
until those privacy and contractual controls have been verified.

Before using real patient information, obtain appropriate Indian privacy and
legal review, establish the clinic's data-controller responsibilities and
vendor agreements, document consent and retention/deletion procedures, and
prepare access, incident-response and breach-notification processes. Minimize
patient information in messages and logs. This software documentation is not
legal advice or a substitute for verifying the applicable law and current
regulations.

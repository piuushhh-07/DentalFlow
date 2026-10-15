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
    recalls/            Preventive recall cycles
  lib/                 Shared utilities
prisma/
  migrations/          Versioned PostgreSQL migrations
  schema.prisma        Clinic-scoped data model
middleware.ts          Supabase session refresh and route protection
```

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
`DIRECT_URL` must use the direct database connection on port `5432`; Prisma
Migrate uses it for schema changes. Copy the exact host, username and TLS
parameters from the Supabase dashboard for your project and network. Do not
expose either database URL to browser code.

Prisma is pinned to version 6.19.2. Its schema uses the Prisma 6
`url`/`directUrl` datasource settings; it does not use Prisma 7's config-file
datasource API.

## Authentication and clinic access

Authentication uses Supabase Auth with server-side `getUser()` verification.
Middleware refreshes the cookie session and protects application routes;
passwords and auth tokens are never read from client-submitted claims. A
successful sign-in creates or updates only the user's local profile, not a
clinic membership.

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
The sign-in screen does not create accounts; provision users through Supabase
Auth and assign memberships through the approved onboarding/admin workflow.
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
configured Supabase project and should be run only against a disposable test
project.

## WhatsApp click-to-chat

The follow-up queue can open a `wa.me` chat with the patient's validated Indian
mobile number and an editable, URL-encoded reminder. DentalFlow does not send
messages automatically and does not integrate with the WhatsApp Business API.
Reminders are disabled unless the patient has WhatsApp opt-in and its recorded
timestamp. Consent is checked again by the server when a user records a
reminder.

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

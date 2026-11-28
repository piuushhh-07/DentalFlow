# DentalFlow Production SaaS Roadmap and Progress Tracker

**Repository:** `piuushhh-07/DentalFlow`  
**Tracking baseline:** `master` at the time this document is merged  
**Last evidence review:** 2026-11-28  
**Purpose:** Living engineering, launch-readiness, and long-term product roadmap. This tracker records repository and GitHub evidence; it is not a production certification.

## 1. Current progress snapshot

### GitHub PR task count

The tracked PR sequence `#140–#216` contains **77 PRs**:

- **75 merged** (including #213, #214, and #215)
- **2 open** (#152, the superseded original Razorpay branch; and #216, its clean replacement)
- **0 counted as completed** for either still-open PR

This is a count of PR-sized changes in that numbered sequence, not a count of all product tasks and not a percentage of production readiness. PR #152 is not mergeable and must not be merged; PR #216 is the active replacement and must pass GitHub Actions before merge.

- **PR #213 — Supabase Data API grant audit:** merged. GitHub Actions run `46162019841` passed.
- **PR #213 coverage:** 28 clinic-data tables; asserts RLS enabled and no table-level SELECT/INSERT/UPDATE/DELETE grants for `anon`, `authenticated`, and `service_role`.
- **Meaning of #213:** completed test coverage only. It does **not** establish complete tenant-isolation verification or prove hosted production-equivalent behavior.
- **PR #214 — production SaaS roadmap:** merged. GitHub Actions run `46164224050` passed, including build.
- **PR #215 — tenant access surface catalog:** merged. GitHub Actions run `46164478750` passed, including build. It catalogs 23 Server Action modules, 91 exports, and 3 API route files / 5 handlers; this is inventory only, not per-action authorization proof.
- **PR #152 — original Razorpay branch:** open but superseded; stale branch is not mergeable. Its earlier CI failed formatting. Do not merge it.
- **PR #216 — clean Razorpay streaming-body-limit replacement:** open. Latest inspected head `6d0ff442a377fc131346ffd66652548306ffe137`; latest CI rerun is being queued after correcting a formatting issue. A previous run failed typecheck because the test used unsupported Uint8Array iteration; that was corrected to `Array.from`. Merge only after the latest full CI succeeds.
- **Vercel preview builds:** currently fail with the build-rate-limit response. This is separate from GitHub Actions and does not substitute for source-code CI.

### Razorpay webhook body-limit work — **PR #216 ACTIVE / PR #152 SUPERSEDED**

The original PR #152 became stale against the evolving master branch and is not mergeable. Its earlier CI run `46163109006` failed the changed-file formatting check. A clean replacement, PR #216, was created from current master with only the route handler, bounded streaming reader, and focused tests.

The first replacement CI run `46164707379` passed unit tests but failed typecheck because the test spread a `Uint8Array` under the repository's TypeScript target. That was corrected to `Array.from`. The next run reached the formatting gate and failed only on the test file; the test descriptions were shortened and reformatted. The latest head is `6d0ff442a377fc131346ffd66652548306ffe137`; the fresh run must pass all required steps before merge. Do not merge #216 unless that exact head passes. Do not merge #152; close it as superseded after the replacement is safely merged.

Vercel preview status is failing due the current build quota. GitHub Actions remains the source-code validation gate while Vercel quota is exhausted.
## 2. Readiness rules

Use these labels consistently:

- **Verified in CI:** the named GitHub Actions job passed on the exact commit SHA.
- **Implemented:** code or documentation exists in the repository; runtime/deployment behavior may still be unverified.
- **Partial:** some required paths or scenarios are covered, with known gaps.
- **Unverified:** no adequate evidence from the target environment or required test run.
- **Blocked:** progress depends on a missing external configuration, decision, quota, or approval.
- **Complete:** all stated acceptance evidence exists. Completion of a PR or unit test alone does not close a broader launch gate.

No static code review, RLS migration, grant assertion, health endpoint, or passing unit suite alone certifies tenant isolation, backup recovery, privacy compliance, or production readiness.

## 3. P0 — must close before real-clinic commercial launch

### P0.1 Tenant isolation proof — **PARTIAL / NOT CLOSED**

Existing evidence includes server-side membership/role guards, clinic-scoped repositories, composite relationships, selected two-clinic integration assertions, raw SQL audit work, insurance Storage checks, and the #213 Data API grant test across 28 tables.

Remaining work:

1. Exhaustively inventory every exported Server Action, server-rendered tenant-data loader, API route, Prisma repository operation, raw SQL statement, browser table/RPC operation, Storage operation, cron job, payment webhook, and membership lifecycle path.
2. For each tenant-owned operation, document the trusted clinic-identity source, authorization guard, role, data operation, and positive/negative two-clinic test.
3. Inspect actual target-project RLS policies, table grants, runtime database role attributes, connection/pooler behavior, and Storage bucket/policy configuration.
4. Run the guarded disposable Supabase integration suite with two independent synthetic clinic users and production-equivalent runtime role/connection behavior.
5. Include cross-clinic reads, inserts, updates, deletes, mismatched linked IDs, revoked/downgraded membership, raw SQL, REST/Data API, and private Storage object access.
6. Have an independent reviewer inspect the completed inventory and evidence.

**Exit evidence:** exhaustive inventory; green hosted disposable integration run; recorded effective grants/policies/role attributes; Storage verification; independent review. #213 is one supporting test, not this exit evidence.

### P0.2 Database and migration safety — **PARTIAL / TARGET STATE UNVERIFIED**

- Reconcile checked-in Prisma migrations against the intended non-production project and migration ledger.
- Review pending migrations, including previously identified pending production migrations, without applying them.
- Validate clean-database migration and representative staging restore/migration behavior on disposable targets.
- Confirm indexes, constraints, RLS/policies, grants, and Storage bucket idempotency.
- Verify runtime transaction-pooler and direct migration connection configuration separately.
- Document migration lock, timeout, rollback/forward-fix, and recovery procedures.

**Exit evidence:** disposable clean install and upgrade tests pass; staging migration rehearsal passes; target identity and migration ledger are reviewed. Production migrations remain disabled unless explicitly approved.

### P0.3 Privacy, data lifecycle, and legal readiness — **PARTIAL**

- Complete data-flow and vendor inventory for patient, clinical, financial, insurance, authentication, analytics, logs, backups, and AI processing.
- Define patient export completeness, retention, correction, erasure, legal holds, audit-history exceptions, and Storage lifecycle.
- Define clinic/controller and vendor/processor responsibilities, consent language, access requests, breach escalation, and incident notification with qualified legal/privacy review.
- Verify patient export includes/excludes exactly the documented data and does not expose internal object paths or secrets.
- Review AI document processing before sending any real patient or insurance documents to an external provider.

**Exit evidence:** approved policy and vendor records; synthetic export/retention/erasure tests; incident and request-handling procedures. No legal-compliance claim from code alone.

### P0.4 Backup, restore, and disaster recovery — **UNVERIFIED**

- Select Supabase backup/PITR tier and retention appropriate to clinic data.
- Define recovery point objective (RPO), recovery time objective (RTO), owners, and escalation.
- Verify database backup coverage and separately assess private Storage object recovery.
- Run a restore drill only into an isolated project; verify schema, data relationships, RLS, Storage metadata/objects, and application access.
- Record actual achieved restore duration and data-loss window.

**Exit evidence:** recoverable backup confirmed and a documented isolated restore drill completed. Never run restore tests against production.

### P0.5 Production operations and release controls — **PARTIAL / DEPLOYMENT EVIDENCE REQUIRED**

- Configure external uptime/error monitoring and alert routing for app, Auth, database, connection saturation, Storage, scheduled jobs, and provider failures.
- Establish support intake, on-call ownership, severity levels, escalation, and incident timeline procedure.
- Verify environment separation, secret scopes, Auth URLs/redirect allowlists, domain/SSL, and least-privilege access.
- Ensure CI covers tests, typecheck, lint, Prisma validation, formatting, and build. Add E2E and disposable integration workflows with protected test-only credentials.
- Rehearse deploy, rollback, forward-fix, and incident response.
- Verify production health and synthetic smoke tests after an explicitly approved deployment.

**Exit evidence:** alerts demonstrated with synthetic failures; runbooks rehearsed; release gate evidence recorded. A passing `/api/health` checks only the database probe and is not full dependency health.

## 4. P1 — complete before broad paid rollout, or document an approved deferral

### P1.1 End-to-end workflow assurance — **PARTIAL**

Build and run browser E2E coverage for the critical clinic journeys:

- Signup/sign-in, onboarding, clinic selection, owner/staff permissions, invitations/revocation.
- Patient registration/update, consent, archive/export/retention lifecycle.
- Appointments, dentist/chair assignment, conflict and duplicate submission handling.
- Treatment plans/visits, FDI odontogram, clinical records, prescriptions.
- Estimates, payments, refunds, insurance claims/documents/payments.
- Recall queue, WhatsApp consent/manual confirmation, and subscription access.
- Cross-clinic URL/ID tampering, session expiry, revoked membership, and role downgrade.

Use synthetic data only. CI currently does not establish that browser E2E or hosted disposable-Supabase integration has passed unless a named run proves it.

### P1.2 Billing lifecycle and entitlements — **PARTIAL**

- Finish Razorpay webhook streaming/body-limit fix in replacement PR #216 only after green GitHub Actions; do not merge superseded PR #152.
- Test sandbox checkout, signature validation, duplicate/replayed events, ambiguous provider outcomes, retries, refunds, cancellations, grace periods, delinquency, plan changes, and reconciliation.
- Verify tenant-bound server-side entitlements, owner access, staff restrictions, and feature/module limits.
- Add operator reconciliation and support workflows.

**Safety:** no live charges, refunds, payment-provider production configuration, or real customer billing without explicit approval.

### P1.3 Insurance Storage and document safety — **PARTIAL**

- Verify actual private bucket existence, allowed MIME types/size limits, RLS/storage policies, and path semantics in a disposable hosted project.
- Test upload/download/sign/delete, wrong clinic/claim/document IDs, malformed paths, oversized or mismatched content, cleanup failures, and replacement recovery.
- Confirm failed database registration cannot leave uncontrolled orphan objects and failed cleanup is observable/retryable.
- Verify backup and restore coverage for private objects.
- Keep AI extraction and coverage recommendations disabled for real documents until provider privacy, retention, contractual terms, source verification, and human review are approved.

### P1.4 Communications reliability — **PARTIAL / LIVE DELIVERY DISABLED**

- Validate opt-in and withdrawal at execution time, templates, idempotency, provider timeouts, retries, duplicate suppression, and delivery-state semantics.
- Add safe operational visibility for failed/ambiguous jobs and dead-letter/manual recovery.
- Confirm cron authentication and scheduling without sending real messages.
- Document provider acceptance vs actual delivery/read confirmation.

**Safety:** no real WhatsApp sends, scheduled live delivery, or production credentials without explicit approval.

### P1.5 Monitoring, support, and operational controls — **PARTIAL**

- Add actionable alert routing and dashboards with privacy-safe telemetry.
- Define support access controls, audit trails, escalation and response targets.
- Monitor background-job lag/failures, webhook processing, payment reconciliation, database pool saturation, Storage usage, backup status, and restore outcomes.
- Add operational dashboards and documented manual recovery for stuck jobs.

### P1.6 Subscription and clinic onboarding operations — **PARTIAL**

- Verify trial/plan activation, plan changes, cancellation, renewal, grace, delinquency, access restrictions, and reactivation.
- Build clinic onboarding checklist, owner setup, staff access, import/export support, and support escalation.
- Ensure no user-supplied clinic or role identifier bypasses trusted membership checks.

## 5. P2 — professional product maturity and scale

These are not launch blockers unless included in the commercial promise. Prioritize using customer evidence and measured demand.

- Multi-branch clinic groups, branch-level roles, consolidated reporting, and branch transfer safeguards.
- Inventory, procurement, supplier returns, expiry/FEFO, wastage, and stock reconciliation.
- Dental lab cases, turnaround tracking, and vendor coordination.
- Equipment maintenance and sterilisation/infection-control workflows.
- Staff attendance, shifts, leave, and payroll/export integrations.
- Patient portal, appointment requests, cancellation requests, care history, and printable summaries.
- Patient lead/CRM pipeline and conversion tracking.
- Advanced finance: cash management, receivables/payables, dentist payouts, reconciliation, and exports.
- Clinical workspace expansion, consent/signatures, imaging/document workflows, and audit-grade amendments.
- Accessibility, localization, mobile usability, and performance budgets.
- API/webhook ecosystem, scoped API keys, partner integrations, and developer documentation.

Do not duplicate existing domain models or ship modules merely because an old branch exists. Review each candidate against current master, schema, security, tests, and product demand before opening a PR.

## 6. Professional SaaS development roadmap — continues after launch

Launch readiness is a gate, not the end of product development. After the P0/P1 launch gates are satisfied, continue through these operating stages:

### Stage A — Stabilize the first paid cohort

- Onboard a small, explicitly approved clinic cohort.
- Track activation, time-to-first-value, weekly active clinics, appointment workflow completion, support tickets, and churn reasons.
- Review incidents and data access audit trails weekly.
- Release small, reversible improvements with feature flags where practical.

### Stage B — Reliability and performance engineering

- Establish service-level indicators (SLIs) for availability, latency, error rate, job completion, and provider outcomes.
- Define service-level objectives (SLOs), error budgets, and release freeze rules.
- Profile real query shapes using privacy-safe telemetry; optimize indexes and query plans from measured bottlenecks.
- Load-test representative multi-tenant workflows and concurrency with synthetic datasets.
- Exercise connection-pool saturation, provider outage, webhook replay, job backlog, and recovery scenarios.

### Stage C — Security and compliance operations

- Schedule recurring access reviews, dependency/security scans, penetration tests, and independent tenant-isolation reviews.
- Maintain threat models, data-flow maps, subprocessor inventory, retention schedules, and incident exercises.
- Add audit evidence and controls for privileged support access.
- Reassess legal/privacy requirements as customer geography and data processing change.

### Stage D — Scale architecture only when metrics justify it

- Measure database CPU, I/O, connection saturation, query latency, Storage throughput, queue lag, and tenant workload distribution.
- Introduce caching, queues, read replicas, partitioning, or service extraction only when a measured bottleneck and consistency model justify each change.
- Preserve tenant boundaries, idempotency, auditability, and data ownership across any new component.
- Test migrations and rollback paths at realistic data volumes before rollout.

### Stage E — Product expansion and ecosystem

- Prioritize roadmap modules from clinic interviews, usage analytics, support themes, and willingness-to-pay evidence.
- Add integrations through documented contracts, least-privilege credentials, retries, reconciliation, and observable failure handling.
- Build public API/webhook contracts and partner onboarding only after security and support controls are ready.
- Revisit pricing and packaging using observed value and operating costs.

### Stage F — Mature engineering organization

- Establish architecture decision records, coding standards, review ownership, release notes, and deprecation policy.
- Maintain a versioned API/schema compatibility strategy.
- Add staging data management, synthetic monitoring, disaster-recovery exercises, and recurring capacity reviews.
- Define ownership for security, privacy, reliability, customer support, and incident response as the team grows.

## 7. Explicit safety boundaries

Until the user explicitly approves the exact operation:

- Do not apply production database migrations or alter production RLS/grants/roles/policies.
- Do not charge, refund, or otherwise transact real money.
- Do not send real WhatsApp messages or enable live scheduled delivery.
- Do not change production environment variables, provider secrets, domains, or deployment settings.
- Do not run destructive production data operations, restores, or erasure jobs.
- Use synthetic data and verified disposable targets for integration and recovery testing.

A user approval for one operation does not imply approval for another.

## 8. Working protocol and status updates

1. Work in small, reviewable branches and pull requests against current `master`.
2. Inspect exact PR head SHA and GitHub Actions run before merge.
3. Merge only after required CI succeeds and the diff is reviewed. A failed or pending run is not merge approval.
4. Treat Vercel quota/rate-limit failures separately from source-code CI failures.
5. Never report a test as passed unless its exact run and result are available.
6. Keep hosted integration, E2E, production configuration, and operational evidence separate from unit-test status.
7. Update this document when evidence changes: PR merged, test run passed, hosted integration completed, deployment verified, or a launch gate formally accepted.
8. Keep progressing beyond launch gates into the professional SaaS roadmap; do not mark the project finished merely because a launch checklist is closed.

## 9. Source documents

- `docs/SAAS_IMPLEMENTATION_PLAN.md` — feature baseline, milestones, rollout/rollback principles, and explicit unknowns.
- `docs/TENANT_ISOLATION_AUDIT_INVENTORY.md` — tenant access surfaces, evidence, test procedure, and isolation exit criteria.
- `docs/OPERATIONS_RUNBOOK.md` — health endpoint semantics, operational triage, deployment checklist, and known operational gaps.
- `docs/OWNER_STAFF_PERMISSION_MATRIX.md` — role and membership access model.
- `README.md` — local setup, guarded disposable integration suite, WhatsApp semantics, insurance Storage, and privacy/backup caveats.

This roadmap should be revised from repository and environment evidence, not optimistic estimates.

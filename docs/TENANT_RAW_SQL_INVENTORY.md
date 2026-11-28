# Tenant-Scoped Raw SQL Inventory

**Baseline:** `master` after PR #217 (2026-11-28)

**Purpose:** Expand the raw SQL review surface identified by the tenant-isolation audit. This is a static source inventory and preliminary predicate review, not a tenant-isolation certification.

## Search result and scope

GitHub code search for Prisma `$queryRaw` in `src/` returned 17 paths. Excluding the public health probe and a unit-test mock leaves **15 production source files**. A search for `$executeRaw` returned one production source file: the insurance repository, which uses both APIs.

This search is a discovery aid, not proof that every SQL statement was found. Continue reviewing tagged templates, helper-generated SQL, raw client calls, database functions, migrations, and SQL hidden behind abstractions.

## Production source locations and preliminary review

### Scheduling, access, and concurrency locks

- `src/features/appointments/lib/appointment-repository.ts` — Advisory locks for dentist/chair scheduling and public-booking phone idempotency; transaction-local lock timeout. Lock keys are built with clinic/resource or clinic/phone identity. The surrounding appointment, request, dentist, chair, patient, and treatment-visit Prisma queries inspected here also include clinic predicates. Continue testing concurrent cross-clinic booking and resource conflicts.
- `src/features/auth/lib/invitation-repository.ts` — Clinic-specific advisory lock while activating invitations and checking staff-seat capacity. Invitation lookup/update and capacity checks use the invitation's clinic. Verify invitation expiry, revocation, and concurrent seat-limit behavior with two clinics.
- `src/features/auth/actions.ts` — Clinic-specific advisory lock for staff-seat invitation creation. The clinic ID comes from the owner authorization result; invitation cleanup/create and capacity checks use that clinic. Verify the full authorization path and last-owner/staff-seat lifecycle tests.
- `src/features/team/actions.ts` — Clinic-specific advisory lock when promoting a member to STAFF. Membership mutation predicates include target membership ID and clinic ID. Continue testing revoked memberships, role downgrade, and last-owner protections.
- `src/features/team/staff-leave-actions.ts` — Advisory lock key includes clinic and user; overlap query and leave-request insert include the same clinic/user identity. Verify staff identity is derived from active membership, not caller-supplied user ID.
- `src/features/billing/lib/billing-repository.ts` — Clinic-specific advisory lock for checkout reservation and plan-change scheduling. Subscription reads and conditional updates include clinic ID. Provider-side idempotency/reconciliation remains a separate reliability review.
- `src/features/finance/actions.ts` — Cash-register close lock includes clinic and business date; close lookup uses the compound clinic/date key. Review every source query in the close transaction and test concurrent close requests.
- `src/features/finance/payables-actions.ts` — Vendor-payment idempotency and bill locks include clinic ID. Bill lookup and payment aggregate include clinic ID; payment idempotency uses a clinic-scoped compound key. Continue validating duplicate retries and concurrent overpayment behavior.
- `src/features/finance/dentist-payout-actions.ts` — Payout-period and payout-payment locks include clinic and dentist/payout identity. Dentist, payout, and payment aggregate lookups include clinic ID. Continue validating duplicate payout/payment races.

### Aggregate and reporting queries

- `src/features/finance/lib/financial-report-repository.ts` — Receivables-aging aggregate. The outer treatment-plan filter is clinic-scoped; patient and financial-entry joins also match clinic IDs. No cross-clinic join gap was visible in the inspected query. Retain two-clinic tests for billed, discount, payment, and refund totals.
- `src/features/follow-ups/lib/follow-up-repository.ts` — Queue count/page share a generated union query. Treatment visits and recalls are filtered by clinic; patient/treatment-plan joins match clinic and patient IDs; manually recorded message-log EXISTS checks match clinic and patient. The summary CTE independently filters both union branches by clinic and scopes message-log EXISTS checks. Retain tests for every tab, counts, pagination, and zero/nonzero cross-clinic results.
- `src/features/reports/lib/report-repository.ts` — Clinic report metrics are built from scalar subqueries. Each inspected patient, appointment, visit, recall, message-log, and treatment-plan subquery filters by the requested clinic; nested treatment-plan EXISTS checks match the visit clinic. Retain two-clinic tests across all metric categories and date boundaries.
- `src/features/treatments/lib/treatment-finance.ts` — Treatment-finance summary CTE filters treatment plans by clinic and joins financial entries by both treatment-plan and clinic IDs; month collections filter financial entries by clinic. Retain two-clinic tests for payment, refund, discount, outstanding, and date-window behavior.

### Onboarding and insurance Storage cleanup

- `src/features/onboarding/lib/prisma-onboarding-repository.ts` — Row lock on the authenticated user's `user_profiles` row, followed by membership lookup by that user ID. This is a user-profile serialization lock rather than a clinic-data query. Verify the user ID comes only from authenticated server context and onboarding cannot create or reuse another user's clinic membership.
- `src/features/insurance/lib/insurance-repository.ts` — Row locks for claims, pre-authorizations, and documents include clinic and parent/child IDs. Cleanup-path SELECT filters clinic and claim. Cleanup-queue INSERT/DELETE statements bind storage path, clinic, claim, and document; completion also checks the current document still references a different path. Review Storage object authorization separately: SQL queue scoping does not prove bucket policy isolation or safe object deletion.

## Non-tenant SQL and test-only matches

- `src/app/api/health/route.ts` — Public readiness probe `SELECT 1`; not a tenant-data query.
- `src/features/appointments/lib/appointment-repository.test.ts` — Test stub for `$queryRaw`; not production SQL.

## Required review evidence

For each production statement:

1. Capture the full SQL statement, calling function, transaction, and input source.
2. Classify it as a lock, row lock, data read, aggregate, insert, update, or delete.
3. Trace every interpolated value to authenticated membership or a validated server-owned record. Parameterization prevents injection; it does not provide tenant isolation.
4. Prove clinic predicates cover every tenant-owned table, CTE, UNION branch, join, and subquery.
5. For lock keys, confirm tenant identity is included where contention must be clinic-local and that the subsequent database operation enforces the same clinic boundary.
6. Add positive same-clinic and negative cross-clinic tests using two clinics. For writes, verify persisted state is unchanged after a denied attempt.
7. Record exact test names and a passing disposable-Supabase run. Unit tests and mocked repository tests are not hosted RLS/role evidence.

## Status

**Catalogued and preliminarily inspected; not fully audited.** The static review above did not reveal an obvious missing clinic predicate in the listed aggregate or cleanup SQL excerpts, but it is not an exhaustive proof of every call path, runtime role, or hosted policy. The existing `docs/TENANT_ISOLATION_AUDIT_INVENTORY.md` remains the canonical tenant-isolation exit checklist. Production-equivalent roles, the guarded disposable-Supabase integration run, full Server Action call-path review, browser/RPC access, and Storage object isolation remain outstanding.

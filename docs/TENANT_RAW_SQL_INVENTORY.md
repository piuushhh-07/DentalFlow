# Tenant-Scoped Raw SQL Inventory

**Baseline:** `master` after PR #215 (2026-11-28)  
**Purpose:** Expand the raw SQL review surface identified by the tenant-isolation audit. This is a static catalog of source locations and query classes, not proof that every query is correctly scoped.

## Search result and scope

A GitHub code search for Prisma `$queryRaw` in `src/` returned 17 paths. After excluding the public health probe and a unit-test mock, **15 production source files** remain. A search for `$executeRaw` returned one production source file: the insurance repository. The same insurance file uses both APIs.

The search is a discovery aid, not a guarantee that every SQL statement was found. Continue reviewing tagged templates, helper-generated SQL, raw client calls, database functions, migrations, and SQL hidden behind abstractions.

## Production source locations

- `src/features/appointments/lib/appointment-repository.ts` — Advisory locks, public-booking lock timeout, phone/resource locking. Lock keys must include clinic and the relevant resource/phone identity; verify every data read/write in the transaction is also clinic-scoped.
- `src/features/auth/lib/invitation-repository.ts` — Advisory lock for staff-seat capacity during invitation activation. Lock key is clinic-specific; verify membership and capacity queries use the same clinic and current membership state.
- `src/features/auth/actions.ts` — Advisory lock for clinic staff-seat invitation creation. Lock key derives from the owner-verified clinic; invitation writes must retain that clinic predicate.
- `src/features/team/actions.ts` — Advisory lock during clinic member role/removal operations. Lock key must use the authorized clinic; inspect membership mutation predicates and last-owner protection.
- `src/features/team/staff-leave-actions.ts` — Advisory lock for a member's leave request. Lock key includes clinic and user; overlap queries must remain clinic/user scoped.
- `src/features/billing/lib/billing-repository.ts` — Advisory lock for checkout and scheduled plan-change reservation. Lock key includes clinic; verify subscription/plan reads and updates use the same clinic and idempotency state.
- `src/features/finance/actions.ts` — Advisory lock for cash-register close by clinic/date. Lock key includes clinic and business date; close/read predicates must match.
- `src/features/finance/payables-actions.ts` — Advisory locks for vendor-bill payment request idempotency and bill-level concurrency. Both lock keys include clinic; verify vendor bill/payment predicates and idempotency key remain clinic-bound.
- `src/features/finance/dentist-payout-actions.ts` — Advisory locks for dentist payout period and payout payment. Lock keys include clinic and dentist/payout; verify dentist and payout lookups use the same clinic.
- `src/features/finance/lib/financial-report-repository.ts` — Receivables-aging aggregate query. Every patient, plan, and visit source/join must be constrained to the requested clinic; review subqueries and date boundaries.
- `src/features/follow-ups/lib/follow-up-repository.ts` — Follow-up queue count, page data, and summary aggregates. Verify clinic predicate in each union branch, nested source, count query, and summary aggregate; test two-clinic zero/nonzero results.
- `src/features/reports/lib/report-repository.ts` — Clinic report aggregate metrics. Verify every scalar subquery uses the same clinic ID and date/status boundary.
- `src/features/treatments/lib/treatment-finance.ts` — Treatment finance summary aggregate. Verify every CTE/source and join is clinic-bound and financial statuses/date ranges match the intended clinic.
- `src/features/onboarding/lib/prisma-onboarding-repository.ts` — Row lock on the authenticated user's profile during onboarding. This is a user-profile lock, not a clinic-data query; confirm the user ID comes from authenticated server context and membership creation remains user/clinic-safe.
- `src/features/insurance/lib/insurance-repository.ts` — Row locks for claim/pre-authorization/document; cleanup-path SELECT; cleanup-queue INSERT/DELETE. Verify clinic, claim, and document predicates on every lock/read/delete; cleanup rows must bind storage path and all owning IDs. Review object-level Storage authorization separately.

## Non-tenant SQL and test-only matches

- `src/app/api/health/route.ts` — public readiness probe `SELECT 1`; not a tenant-data query.
- `src/features/appointments/lib/appointment-repository.test.ts` — test stub for `$queryRaw`; not production SQL.

## Review checklist

For each production statement above:

1. Capture the full SQL statement and the calling function, transaction, and input source.
2. Mark it as a lock, row-lock, data read, aggregate, insert, update, or delete.
3. Trace every interpolated value to a trusted authenticated membership or validated server-owned record. Parameterization prevents injection; it does not provide tenant isolation.
4. For data queries and mutations, prove the clinic predicate covers every tenant-owned table, CTE, union branch, join, and subquery.
5. For lock keys, confirm the clinic identity is included where contention must be tenant-local and that the subsequent database operation enforces the same clinic boundary.
6. Add positive same-clinic and negative cross-clinic tests using two synthetic clinics. For writes, verify persisted state is unchanged after a denied attempt.
7. Record exact test names and a passing disposable-Supabase run. Unit tests or mocked repository tests are not hosted RLS/role evidence.

## Status

**Catalogued, not fully audited.** The existing `docs/TENANT_ISOLATION_AUDIT_INVENTORY.md` remains the canonical tenant-isolation exit checklist. This file expands the raw SQL discovery list; it does not close the raw SQL audit, certify production tenant isolation, or replace the guarded disposable Supabase run with production-equivalent roles.

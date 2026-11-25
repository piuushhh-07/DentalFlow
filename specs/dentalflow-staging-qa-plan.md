# DentalFlow Staging QA Test Plan

## Application Overview

Comprehensive manual Playwright QA plan for the DentalFlow staging preview. Fresh browser state, synthetic demo data only. No record deletion, real payment, WhatsApp send, subscription change, or production mutation. Screenshots are required checkpoints with synthetic values only.

## Test Scenarios

### 1. Authentication

**Seed:** `tests/e2e/seed.spec.ts`

#### 1.1. Sign-in, logout, and protected routes

**File:** `tests/e2e/authentication.spec.ts`

**Steps:**
  1. Navigate to the staging root in an isolated browser.
    - expect: It redirects to sign-in or an authorized clinic route.
    - expect: The staging URL and credentials are not disclosed in page text.
  2. Sign in with a staging-only owner account.
    - expect: Authentication succeeds.
    - expect: A clinic dashboard or `/clinics` page renders.
    - expect: The account role is consistent.
  3. Capture the authenticated landing page.
    - expect: Screenshot `auth-owner-landing.png` records the landing state.
  4. Submit invalid synthetic credentials.
    - expect: A clear authentication or validation error appears.
    - expect: No session or patient data is created.
  5. Capture the invalid login state.
    - expect: Screenshot `auth-invalid-login.png` records the error.
  6. Sign out, then open a protected deep link.
    - expect: The app redirects to login or access denied.
    - expect: Protected clinic data is not rendered before redirect.
  7. Capture the protected-route state.
    - expect: Screenshot `auth-protected-route.png` records the redirect.

#### 1.2. Session and callback stability

**File:** `tests/e2e/authentication.spec.ts`

**Steps:**
  1. Reload an authenticated clinic page.
    - expect: The session remains stable.
    - expect: The same authorized clinic and route persist.
  2. Open a direct deep link in a second tab.
    - expect: Authorized deep links render; expired or unsupported callbacks show a safe error.
    - expect: No credential or token appears in visible text.

### 2. Patient management

**Seed:** `tests/e2e/seed.spec.ts`

#### 2.1. Patient search, 360, and isolation

**File:** `tests/e2e/patients.spec.ts`

**Steps:**
  1. Open the synthetic clinic patient list.
    - expect: The list loads without console or server errors.
    - expect: Only demo patients for the selected clinic appear.
  2. Capture the patient list.
    - expect: Screenshot `patient-list.png` records the list.
  3. Search for a known demo name, then a nonexistent name.
    - expect: The known patient appears.
    - expect: The nonexistent search shows a clear empty state.
    - expect: No cross-clinic patient is returned.
  4. Open the synthetic patient's 360 view.
    - expect: Demographics and linked modules load within the selected clinic.
    - expect: No cross-clinic linked records appear.
  5. Capture patient 360.
    - expect: Screenshot `patient-360.png` records the demo overview.
  6. Open another clinic's patient URL directly.
    - expect: Access is denied or the object is not found.
    - expect: No patient values leak.

#### 2.2. Create, edit, and export boundaries

**File:** `tests/e2e/patients.spec.ts`

**Steps:**
  1. Open the new-patient form and submit with required fields blank.
    - expect: Validation identifies missing fields.
    - expect: No record is created.
  2. Create a clearly fictional patient prefixed `QA DEMO`.
    - expect: Valid synthetic details create or reject duplicates according to rules.
    - expect: The record is scoped to the selected clinic.
  3. Capture creation.
    - expect: Screenshot `patient-create.png` records the synthetic form or result.
  4. Edit one synthetic non-sensitive field and reload.
    - expect: The update persists.
    - expect: The update is visible only for this demo patient.
  5. Exercise export only for synthetic data.
    - expect: Owner policy allows only the intended synthetic record.
    - expect: Staff export is denied if policy forbids it.
    - expect: Export never includes real PII.

### 3. Appointments and scheduling conflicts

**Seed:** `tests/e2e/schedule-resource-management.spec.ts`

#### 3.1. Create resources and appointments

**File:** `tests/e2e/appointments.spec.ts`

**Steps:**
  1. Open `/clinic/{clinicId}/appointments` as staging owner.
    - expect: The calendar, dentists, chairs, and status controls render.
    - expect: Resources are clinic-scoped.
  2. Create dentist and chair names prefixed `QA Demo` if mutation is permitted.
    - expect: Each resource is created once.
    - expect: Duplicate names are rejected.
    - expect: Selectors update consistently.
  3. Capture resource controls.
    - expect: Screenshot `appointment-resources.png` records resources.
  4. Create an appointment for a synthetic patient in a free slot.
    - expect: It appears at the correct date, time, dentist, and chair.
    - expect: Status and duration are consistent.
  5. Capture the created booking.
    - expect: Screenshot `appointment-created.png` records the booking.

#### 3.2. Conflict, boundary, and isolation checks

**File:** `tests/e2e/appointments.spec.ts`

**Steps:**
  1. Attempt an overlapping appointment using the same dentist or chair.
    - expect: A conflict is rejected or clearly warned.
    - expect: No duplicate booking is silently created.
  2. Capture conflict.
    - expect: Screenshot `appointment-conflict.png` records the warning.
  3. Test adjacent slots and invalid durations or clinic-hours.
    - expect: Touching slots follow the documented conflict boundary.
    - expect: Overlaps and invalid durations are blocked.
    - expect: Clinic-hours validation is clear.
  4. Change the synthetic status and reload.
    - expect: Only valid transitions are allowed.
    - expect: Calendar and patient 360 remain consistent.
  5. Open the booking under another clinic.
    - expect: It is denied or not found.
    - expect: No dentist, chair, patient, or time details leak.

### 4. Dental odontogram

**Seed:** `tests/e2e/seed.spec.ts`

#### 4.1. View, update, and isolate odontogram

**File:** `tests/e2e/odontogram.spec.ts`

**Steps:**
  1. Open the odontogram for a synthetic patient.
    - expect: The dental chart and existing demo findings render.
    - expect: No real diagnosis is inferred.
  2. Capture baseline.
    - expect: Screenshot `odontogram-baseline.png` records the chart.
  3. Apply a supported non-clinical demo label to one tooth.
    - expect: Only the intended tooth and surface change.
    - expect: The UI identifies the synthetic nature of the update.
  4. Save and reload.
    - expect: The demo condition persists on the correct tooth.
    - expect: Unrelated teeth remain unchanged.
  5. Capture updated chart.
    - expect: Screenshot `odontogram-updated.png` records the update.
  6. Open another synthetic patient.
    - expect: The previous chart is not reused or mixed.
    - expect: Permission rules remain consistent.

### 5. Treatment plans and multiple visits

**Seed:** `tests/e2e/seed.spec.ts`

#### 5.1. Create multi-visit plan

**File:** `tests/e2e/treatments.spec.ts`

**Steps:**
  1. Open a synthetic patient's treatment plans.
    - expect: Existing demo plans and history load for that patient.
    - expect: The patient and clinic context are explicit.
  2. Create a plan labeled `QA DEMO` with three synthetic visits.
    - expect: Required fields validate.
    - expect: The plan is saved only for the selected patient.
    - expect: Visit sequence, dates, procedures, and fees persist.
  3. Capture the plan.
    - expect: Screenshot `treatment-multivisit.png` records all demo visits.
  4. Complete the first visit and start the next if supported.
    - expect: Only valid transitions occur.
    - expect: Patient 360 and plan status remain consistent.
  5. Attempt an invalid out-of-sequence transition.
    - expect: The UI prevents or warns.
    - expect: No conflicting status is silently applied.

#### 5.2. Cancel plan and isolate history

**File:** `tests/e2e/treatments.spec.ts`

**Steps:**
  1. Cancel or decline the synthetic plan using supported controls.
    - expect: Status changes without deleting visit history.
    - expect: Historical entries remain traceable.
  2. Capture final state.
    - expect: Screenshot `treatment-transitions.png` records the demo status.
  3. Open another patient's treatment plans.
    - expect: The demo plan is not visible.
    - expect: No cross-patient data leak occurs.

### 6. Prescriptions

**Seed:** `tests/e2e/seed.spec.ts`

#### 6.1. Create and review prescription

**File:** `tests/e2e/prescriptions.spec.ts`

**Steps:**
  1. Open a synthetic patient's prescriptions.
    - expect: Existing demo prescriptions render.
    - expect: The patient identity is clear.
  2. Create a prescription with fictitious medicine names and advice.
    - expect: Required fields validate.
    - expect: The record saves only under the synthetic patient.
    - expect: No WhatsApp or print action starts automatically.
  3. Capture creation.
    - expect: Screenshot `prescription-created.png` records the demo-only record.
  4. Reload and open prescription detail.
    - expect: Medicine rows, dosage, route, advice, and attribution remain consistent.
    - expect: No external messaging is triggered.

#### 6.2. Prescription permissions and isolation

**File:** `tests/e2e/prescriptions.spec.ts`

**Steps:**
  1. Compare owner and staff access.
    - expect: Unauthorized edit or export controls are hidden or denied.
    - expect: Permitted actions match the staging role policy.
  2. Open a prescription route from another clinic.
    - expect: Access is denied or not found.
    - expect: No cross-clinic prescription details render.
  3. Capture the isolation result.
    - expect: Screenshot `prescription-isolation.png` records the result.

### 7. Estimates and payments

**Seed:** `tests/e2e/seed.spec.ts`

#### 7.1. Estimate lifecycle

**File:** `tests/e2e/estimates.spec.ts`

**Steps:**
  1. Open estimates for a synthetic treatment plan.
    - expect: Patient, clinic, procedures, and totals are scoped to demo data.
    - expect: Currency and fee fields render consistently.
  2. Create a demo estimate with fictional procedures and exact synthetic totals.
    - expect: Line totals and grand total calculate correctly.
    - expect: The estimate saves in a supported draft or presented state.
  3. Capture estimate.
    - expect: Screenshot `estimate-created.png` records demo totals.
  4. Advance supported statuses and reload.
    - expect: Only valid transitions are allowed.
    - expect: The estimate remains tied to the plan and patient.

#### 7.2. Payment safety and isolation

**File:** `tests/e2e/estimates.spec.ts`

**Steps:**
  1. Do not activate any real payment control.
    - expect: No card, UPI, bank, checkout, or capture request is triggered.
    - expect: A real payment gateway is never called.
  2. If demo receipt entry is available, use zero or clearly labeled synthetic values.
    - expect: Totals, balance, and overpayment rules are consistent.
    - expect: Negative or overpaid balances are blocked or warned.
  3. Capture the demo ledger.
    - expect: Screenshot `estimate-payment-safe.png` records safe synthetic state.
  4. Open an estimate from another clinic.
    - expect: The estimate is denied or not found.
    - expect: No financial information leaks.
  5. Inspect network activity.
    - expect: No real payment, WhatsApp, or subscription endpoint is contacted.

### 8. Insurance documentation

**Seed:** `tests/e2e/seed.spec.ts`

#### 8.1. Providers, policies, and claims

**File:** `tests/e2e/insurance.spec.ts`

**Steps:**
  1. Open the insurance workspace.
    - expect: The selected clinic's synthetic providers and policies load.
    - expect: No real holder PII is present.
  2. Create or open clearly labeled demo provider and policy records.
    - expect: Required and format validation works.
    - expect: Synthetic identifiers persist only in staging.
  3. Capture insurance setup.
    - expect: Screenshot `insurance-provider-policy.png` records the demo setup.
  4. Create synthetic pre-authorizations and claims.
    - expect: Patient, provider, procedures, and amounts link consistently.
    - expect: Invalid submissions are blocked.
  5. Capture claim status.
    - expect: Screenshot `insurance-claim.png` records the synthetic claim.
  6. Upload only a benign dummy image or text file.
    - expect: File rules are enforced.
    - expect: No personal or medical real-world data is uploaded.

#### 8.2. Insurance isolation

**File:** `tests/e2e/insurance.spec.ts`

**Steps:**
  1. Open insurance objects through another clinic's URL.
    - expect: Records are denied or not found.
    - expect: No provider, policy, claim, or document metadata leaks.
  2. Capture the result.
    - expect: Screenshot `insurance-isolation.png` records the denial.

### 9. Recall management

**Seed:** `tests/e2e/seed.spec.ts`

#### 9.1. Create recall and lifecycle

**File:** `tests/e2e/recalls.spec.ts`

**Steps:**
  1. Open `/clinic/{clinicId}/recalls`.
    - expect: The synthetic recall list and filters load.
    - expect: Records remain clinic-scoped.
  2. Create a recall for a demo patient with a future staging date.
    - expect: Required fields validate.
    - expect: Due date, patient, type, and initial status are correct.
    - expect: No message is sent automatically.
  3. Capture creation.
    - expect: Screenshot `recall-created.png` records the synthetic recall.
  4. Test due-date filters and status transitions.
    - expect: Valid recalls appear in expected states.
    - expect: Invalid dates or missing patients are rejected.
    - expect: Completed recalls do not remain overdue.
  5. Capture key states.
    - expect: Screenshots `recall-overdue.png` and `recall-completed.png` record applicable states.
  6. Do not activate WhatsApp or SMS controls.
    - expect: No external messaging request or send occurs.

#### 9.2. Recall isolation

**File:** `tests/e2e/recalls.spec.ts`

**Steps:**
  1. Open another clinic's recall URL.
    - expect: Access is denied or not found.
    - expect: No cross-clinic patient or recall details render.
  2. Capture isolation.
    - expect: Screenshot `recall-isolation.png` records the result.

### 10. Owner and staff permissions

**Seed:** `tests/e2e/auth-and-schedule.smoke.spec.ts`

#### 10.1. Owner navigation

**File:** `tests/e2e/permissions.spec.ts`

**Steps:**
  1. Sign in with a staging owner account.
    - expect: Owner can view permitted dashboard, team, hours, and administration areas.
    - expect: At least one owner remains in the account under test.
  2. Capture owner navigation.
    - expect: Screenshot `owner-navigation.png` records owner-only items.

#### 10.2. Staff restrictions and role invariants

**File:** `tests/e2e/permissions.spec.ts`

**Steps:**
  1. Sign in with a staging staff account.
    - expect: Permitted clinical operations work.
    - expect: Owner-only team, export, role, or finance controls are hidden or denied.
  2. Capture staff navigation.
    - expect: Screenshot `staff-navigation.png` records permitted items.
  3. Open an owner-only URL directly.
    - expect: It redirects or returns access denied.
    - expect: Owner-only data is not rendered.
  4. Capture denial.
    - expect: Screenshot `staff-owner-denial.png` records the result.
  5. Review role invariants without changing real accounts.
    - expect: The last owner cannot be removed or demoted if controls are shown.
    - expect: Synthetic seat changes follow clinic limits.

### 11. Subscription plans and usage limits

**Seed:** `tests/e2e/seed.spec.ts`

#### 11.1. Catalog and entitlement rendering

**File:** `tests/e2e/subscription.spec.ts`

**Steps:**
  1. Open plan or subscription UI.
    - expect: Catalog or entitlement state is informational and does not activate a checkout.
    - expect: Current plan remains unchanged.
  2. Capture plan view.
    - expect: Screenshot `subscription-catalog.png` records staging state.
  3. Compare usage labels with synthetic account state.
    - expect: Patient and staff usage are accurate.
    - expect: Checkout and upgrade actions are disabled or clearly non-production.

#### 11.2. Usage limit behavior

**File:** `tests/e2e/subscription.spec.ts`

**Steps:**
  1. Attempt an extra demo patient, appointment, or staff-seat action at a known limit.
    - expect: The action is blocked or warned according to entitlements.
    - expect: No subscription setting or plan is changed.
  2. Capture limit state.
    - expect: Screenshot `usage-limit.png` records the clear limit message.
  3. Do not enter payment details or activate an upgrade.
    - expect: No payment or subscription network request occurs.
    - expect: The current plan remains unchanged.

### 12. Multi-clinic data isolation

**Seed:** `tests/e2e/seed.spec.ts`

#### 12.1. Clinic switching and object isolation

**File:** `tests/e2e/multiclinic.spec.ts`

**Steps:**
  1. Open clinics and switch between two synthetic memberships.
    - expect: The active clinic identity changes consistently.
    - expect: Navigation uses the selected clinic ID.
    - expect: All modules reload clinic-scoped data.
  2. Capture both contexts.
    - expect: Screenshots `clinic-a-context.png` and `clinic-b-context.png` record separate identities.
  3. Reuse a Clinic A object ID inside Clinic B URLs.
    - expect: Patients, appointments, plans, estimates, prescriptions, recalls, and insurance are denied or not found.
    - expect: No cross-clinic values render.
  4. Capture denial.
    - expect: Screenshot `multiclinic-isolation.png` records the result.

#### 12.2. Session and network boundary

**File:** `tests/e2e/multiclinic.spec.ts`

**Steps:**
  1. Reload and use browser back/forward across two clinics.
    - expect: The active clinic and object context remain stable.
    - expect: No stale clinic A search or selection leaks into clinic B.
  2. Inspect network responses from clinic-scoped requests.
    - expect: No unintended clinic records are returned.
    - expect: Mutations include the correct clinic context.
    - expect: Auth and membership checks occur server-side.
  3. Open direct URLs for an account with membership only in Clinic A.
    - expect: Clinic B is absent from selectors.
    - expect: Direct Clinic B requests are denied.

### 13. Cross-cutting reliability and safety

**Seed:** `tests/e2e/seed.spec.ts`

#### 13.1. Responsive, console, network, and screenshot audit

**File:** `tests/e2e/reliability.spec.ts`

**Steps:**
  1. Repeat core landing, patient, appointment, and treatment views at desktop and narrow widths.
    - expect: No clipping or overlapping controls.
    - expect: Core actions remain accessible.
  2. Capture representative layouts.
    - expect: Screenshots `desktop-core.png` and `narrow-core.png` record the states.
  3. Reload core pages and use browser back/forward.
    - expect: No duplicate submissions or lost clinic context occur.
    - expect: Navigation is predictable.
  4. Collect console and network evidence.
    - expect: No uncaught application error occurs.
    - expect: No real payment, WhatsApp, subscription, or production API is called.
    - expect: Only synthetic demo values appear in screenshots.
  5. Capture final evidence.
    - expect: Screenshots `console-clean.png` and `network-safe.png` record browser evidence if available.

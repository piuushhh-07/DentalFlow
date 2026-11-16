# Dental Laboratory QA Checklist

Run this checklist in a non-production clinic/demo environment after the migration for Dental Lab Management has been applied through the normal deployment pipeline.

## Access and subscription

- [ ] A clinic OWNER with Dental Lab Management enabled can open the Lab workspace.
- [ ] A clinic STAFF member can view permitted workspace data but cannot create partners, create orders, or change order statuses.
- [ ] A Solo clinic without the `dentalLabManagement` entitlement cannot write lab data.
- [ ] A Professional or Enterprise clinic with the entitlement can perform lab workflows.
- [ ] If a clinic loses the entitlement, existing lab records remain readable while write actions are blocked.
- [ ] A user who is not a member of the clinic cannot open its workspace or mutate its records.

## Laboratory partners

- [ ] Create a partner with required name only.
- [ ] Create a partner with contact name, phone, email, address, and notes.
- [ ] Reject a duplicate partner name in the same clinic with a useful message.
- [ ] Verify partners belonging to another clinic are not selectable or visible.
- [ ] Verify inactive partners are not available for new work orders.

## Work order creation

- [ ] Create an order for an active patient and an active lab partner.
- [ ] Create an order linked to an active treatment plan for the same patient.
- [ ] Reject a treatment plan belonging to another patient or clinic.
- [ ] Reject an archived patient and an inactive/nonexistent lab partner.
- [ ] Verify optional tooth numbers, material, shade, instructions, and quote are saved correctly.
- [ ] Verify invalid dates, malformed IDs, negative quotes, and oversized fields are rejected.
- [ ] Verify all displayed money is INR and all due dates use the clinic timezone.

## Status lifecycle

- [ ] DRAFT -> SENT_TO_LAB -> ACCEPTED -> IN_PROGRESS -> READY -> DISPATCHED -> RECEIVED -> FITTED.
- [ ] Verify permitted shortcuts explicitly supported by the workflow: SENT_TO_LAB -> IN_PROGRESS and READY -> RECEIVED.
- [ ] Verify remake can be requested from IN_PROGRESS, READY, DISPATCHED, RECEIVED, and FITTED.
- [ ] Verify a remake reason is mandatory and shown on the work order.
- [ ] Verify REMAKE_REQUESTED can return to SENT_TO_LAB or be cancelled.
- [ ] Verify CANCELLED is terminal.
- [ ] Verify skipped/backwards transitions are rejected with a useful message.
- [ ] Verify two simultaneous status updates cannot silently overwrite each other.
- [ ] Verify sentAt and receivedAt timestamps are recorded on the corresponding transitions.
- [ ] Verify tracking reference is saved and displayed.

## Dashboard and data integrity

- [ ] Open, due/overdue, and active partner counts match the underlying records.
- [ ] Fitted and cancelled orders are excluded from open and overdue counts.
- [ ] A due-today order is not incorrectly marked overdue.
- [ ] Orders remain scoped to the current clinic in list, detail, and mutation paths.
- [ ] Verify the latest 100 orders are sorted as expected and pagination/retention requirements are understood.
- [ ] Verify all writes are blocked cleanly if the subscription is restricted.
- [ ] Confirm migration status and schema compatibility in the target non-production database before production rollout.

## Release evidence

- [ ] GitHub Actions unit tests pass, including `src/features/dental-lab/workflow.test.ts`.
- [ ] Typecheck, lint, Prisma validation, formatting, and production build pass.
- [ ] Preview deployment reaches READY.
- [ ] A clinic owner completes one end-to-end partner -> work order -> status -> remake workflow.
- [ ] No production migration or production data mutation is performed as part of preview QA.

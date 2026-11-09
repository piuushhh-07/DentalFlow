import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicBookingPhoneLockKey,
  isDuplicatePublicBookingRequest,
  PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS,
  type ExistingPublicBookingRequest,
  type PublicBookingRequestDetails,
} from "@/features/appointments/lib/public-booking-idempotency";

const now = new Date("2026-11-09T05:30:00.000Z");
const clinicId = "10000000-0000-4000-8000-000000000001";
const details: PublicBookingRequestDetails = {
  patientName: "Asha Patel",
  phoneNumber: "+919876543210",
  requestedAt: new Date("2026-11-10T04:00:00.000Z"),
  dentistId: "20000000-0000-4000-8000-000000000002",
  chairId: "30000000-0000-4000-8000-000000000003",
  notes: "Please call before confirming",
};

function existingRequest(
  overrides: Partial<ExistingPublicBookingRequest> = {},
): ExistingPublicBookingRequest {
  return {
    id: "request-1",
    clinicId,
    ...details,
    createdAt: new Date(now.getTime() - 10_000),
    ...overrides,
  };
}

test("matches a repeated pending request with identical details in the short window", () => {
  assert.equal(
    isDuplicatePublicBookingRequest(existingRequest(), clinicId, details, now),
    true,
  );
});

test("does not deduplicate a different booking or another clinic's request", () => {
  for (const overrides of [
    { clinicId: "another-clinic" },
    { patientName: "Asha P." },
    { phoneNumber: "+919876543211" },
    { requestedAt: new Date(details.requestedAt.getTime() + 60_000) },
    { dentistId: "another-dentist" },
    { chairId: "another-chair" },
    { notes: "Different note" },
  ]) {
    assert.equal(
      isDuplicatePublicBookingRequest(
        existingRequest(overrides),
        clinicId,
        details,
        now,
      ),
      false,
    );
  }
});

test("does not deduplicate requests outside the short window or from the future", () => {
  assert.equal(
    isDuplicatePublicBookingRequest(
      existingRequest({
        createdAt: new Date(
          now.getTime() - PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS - 1,
        ),
      }),
      clinicId,
      details,
      now,
    ),
    false,
  );
  assert.equal(
    isDuplicatePublicBookingRequest(
      existingRequest({ createdAt: new Date(now.getTime() + 1) }),
      clinicId,
      details,
      now,
    ),
    false,
  );
});

test("phone lock keys are stable and scoped by both clinic and phone", () => {
  assert.equal(
    getPublicBookingPhoneLockKey(clinicId, details.phoneNumber),
    getPublicBookingPhoneLockKey(clinicId, details.phoneNumber),
  );
  assert.notEqual(
    getPublicBookingPhoneLockKey(clinicId, details.phoneNumber),
    getPublicBookingPhoneLockKey("another-clinic", details.phoneNumber),
  );
  assert.notEqual(
    getPublicBookingPhoneLockKey(clinicId, details.phoneNumber),
    getPublicBookingPhoneLockKey(clinicId, "+919876543211"),
  );
});

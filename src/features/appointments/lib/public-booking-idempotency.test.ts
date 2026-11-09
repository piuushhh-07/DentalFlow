import assert from "node:assert/strict";
import test from "node:test";

import {
  createOrReusePublicBookingRequest,
  getPublicBookingPhoneLockKey,
  getPublicBookingPhoneLockQuery,
  isDuplicatePublicBookingRequest,
  PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS,
  type ExistingPublicBookingRequest,
  type PublicBookingIdempotencyOperations,
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

function createRequestHarness() {
  const requests: ExistingPublicBookingRequest[] = [];
  let lockTail = Promise.resolve();
  let nextId = 1;

  function operations(
    input: PublicBookingRequestDetails,
  ): PublicBookingIdempotencyOperations {
    return {
      withLock: async <T>(operation: () => Promise<T>) => {
        const previousLock = lockTail;
        let releaseLock = () => {};
        lockTail = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        await previousLock;
        try {
          return await operation();
        } finally {
          releaseLock();
        }
      },
      findRecentRequests: async () =>
        requests.filter(
          (request) =>
            request.clinicId === clinicId &&
            request.phoneNumber === input.phoneNumber &&
            request.requestedAt.getTime() === input.requestedAt.getTime(),
        ),
      createRequest: async () => {
        const request = existingRequest({
          id: `request-${nextId++}`,
          ...input,
          createdAt: now,
        });
        requests.push(request);
        return { id: request.id };
      },
    };
  }

  return {
    requests,
    submit(input: PublicBookingRequestDetails = details) {
      return createOrReusePublicBookingRequest(
        clinicId,
        input,
        now,
        operations(input),
      );
    },
  };
}

test("matches a repeated pending request with identical details in the short window", () => {
  assert.equal(
    isDuplicatePublicBookingRequest(existingRequest(), clinicId, details, now),
    true,
  );
});

test("creates a booking request when no matching request exists", async () => {
  const harness = createRequestHarness();

  const result = await harness.submit();

  assert.deepEqual(result, { id: "request-1" });
  assert.equal(harness.requests.length, 1);
});

test("reuses a repeated identical booking request", async () => {
  const harness = createRequestHarness();

  const first = await harness.submit();
  const second = await harness.submit();

  assert.deepEqual(second, first);
  assert.equal(harness.requests.length, 1);
});

test("serializes concurrent identical submissions and creates only one request", async () => {
  const harness = createRequestHarness();

  const results = await Promise.all([harness.submit(), harness.submit()]);

  assert.deepEqual(results[0], results[1]);
  assert.equal(harness.requests.length, 1);
});

test("creates a distinct request for different booking details", async () => {
  const harness = createRequestHarness();
  const differentBooking = {
    ...details,
    requestedAt: new Date(details.requestedAt.getTime() + 60 * 60_000),
  };

  const first = await harness.submit();
  const second = await harness.submit(differentBooking);

  assert.notDeepEqual(second, first);
  assert.equal(harness.requests.length, 2);
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

test("phone lock query returns an integer while retaining the transaction lock", () => {
  const query = getPublicBookingPhoneLockQuery("clinic-phone-key");

  assert.match(
    query.sql,
    /SELECT \(pg_advisory_xact_lock\(hashtext\(\?\)\) IS NULL\)::int AS locked/,
  );
  assert.deepEqual(query.values, ["clinic-phone-key"]);
});

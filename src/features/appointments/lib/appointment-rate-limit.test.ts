import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT,
  getPublicAppointmentRateLimitConfig,
  isPublicAppointmentRequestRateLimited,
} from "@/features/appointments/lib/appointment-rate-limit";

test("public appointment rate limit defaults to 3 requests per 60 minutes", () => {
  assert.deepEqual(
    getPublicAppointmentRateLimitConfig(undefined, undefined),
    DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT,
  );
});

test("public appointment rate limit accepts custom positive integer values", () => {
  assert.deepEqual(getPublicAppointmentRateLimitConfig("20", "60"), {
    maxRequests: 20,
    windowMinutes: 60,
  });
});

test("invalid public appointment rate limit values fall back independently", () => {
  for (const invalid of ["", " ", "0", "-1", "1.5", "1e2", "abc"]) {
    assert.deepEqual(
      getPublicAppointmentRateLimitConfig(invalid, invalid),
      DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT,
      `expected ${JSON.stringify(invalid)} to use defaults`,
    );
  }

  assert.deepEqual(
    getPublicAppointmentRateLimitConfig("20", "9007199254740991"),
    {
      maxRequests: 20,
      windowMinutes: DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT.windowMinutes,
    },
  );
});

test("rate limit allows requests below the configured maximum and rejects at it", () => {
  assert.equal(isPublicAppointmentRequestRateLimited(19, 20), false);
  assert.equal(isPublicAppointmentRequestRateLimited(20, 20), true);
  assert.equal(
    isPublicAppointmentRequestRateLimited(
      DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT.maxRequests - 1,
      DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT.maxRequests,
    ),
    false,
  );
  assert.equal(
    isPublicAppointmentRequestRateLimited(
      DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT.maxRequests,
      DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT.maxRequests,
    ),
    true,
  );
});

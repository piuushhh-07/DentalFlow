import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TreatmentVisitStatus } from "@prisma/client";

import {
  canTransitionTreatmentVisit,
  getClinicToday,
  toClinicDateInput,
  toDatabaseDate,
} from "@/features/treatments/lib/treatment-validation";

describe("treatment validation", () => {
  it("allows valid status transitions and blocks invalid ones", () => {
    assert.equal(
      canTransitionTreatmentVisit(
        TreatmentVisitStatus.PENDING,
        TreatmentVisitStatus.REMINDER_SENT,
      ),
      true,
    );
    assert.equal(
      canTransitionTreatmentVisit(
        TreatmentVisitStatus.COMPLETED,
        TreatmentVisitStatus.PENDING,
      ),
      false,
    );
    assert.equal(
      canTransitionTreatmentVisit(
        TreatmentVisitStatus.CANCELLED,
        TreatmentVisitStatus.NO_RESPONSE,
      ),
      false,
    );
  });

  it("converts clinic dates into database-safe UTC dates and back", () => {
    const date = toDatabaseDate("2025-04-10");
    assert.equal(date.toISOString().slice(0, 10), "2025-04-10");
    assert.equal(
      toClinicDateInput(new Date("2025-04-10T00:00:00.000Z")),
      "2025-04-10",
    );
  });

  it("derives the clinic-local date for Asia/Kolkata", () => {
    const now = new Date("2025-04-10T18:30:00.000Z");
    assert.equal(getClinicToday(now), "2025-04-11");
  });
});

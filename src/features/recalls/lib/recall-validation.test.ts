import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PreventiveRecallStatus, PreventiveRecallType } from "@prisma/client";

import {
  canRescheduleRecall,
  canTransitionRecallStatus,
  getClinicToday,
  isDuplicateActiveRecall,
  isRecallOverdue,
  recallBelongsToClinic,
  recallInputSchema,
  toDatabaseDate,
} from "@/features/recalls/lib/recall-validation";

describe("preventive recall rules", () => {
  it("validates standard six-month and custom interval recalls", () => {
    const sixMonth = recallInputSchema.safeParse({
      type: PreventiveRecallType.SIX_MONTH_CHECKUP,
      customName: "",
      intervalMonths: "",
      dueDate: "2027-04-15",
      notes: "",
    });
    assert.equal(sixMonth.success, true);
    if (sixMonth.success) assert.equal(sixMonth.data.intervalMonths, 6);

    const customWithoutInterval = recallInputSchema.safeParse({
      type: PreventiveRecallType.CUSTOM,
      customName: "Orthodontic review",
      intervalMonths: "",
      dueDate: "2027-04-15",
      notes: "",
    });
    assert.equal(customWithoutInterval.success, false);

    const custom = recallInputSchema.safeParse({
      type: PreventiveRecallType.CUSTOM,
      customName: "Orthodontic review",
      intervalMonths: "9",
      dueDate: "2027-04-15",
      notes: "",
    });
    assert.equal(custom.success, true);
    if (custom.success) assert.equal(custom.data.intervalMonths, 9);
  });

  it("rejects impossible calendar dates and out-of-range intervals", () => {
    const invalidDate = recallInputSchema.safeParse({
      type: PreventiveRecallType.CLEANING,
      customName: "",
      intervalMonths: "12",
      dueDate: "2027-02-30",
      notes: "",
    });
    assert.equal(invalidDate.success, false);

    const invalidInterval = recallInputSchema.safeParse({
      type: PreventiveRecallType.CUSTOM,
      customName: "Recall",
      intervalMonths: "121",
      dueDate: "2027-04-15",
      notes: "",
    });
    assert.equal(invalidInterval.success, false);
  });

  it("identifies only the active-cycle unique constraint as a duplicate", () => {
    assert.equal(
      isDuplicateActiveRecall({
        code: "P2002",
        meta: { target: ["preventive_recalls_active_cycle_key"] },
      }),
      true,
    );
    assert.equal(
      isDuplicateActiveRecall({
        code: "P2002",
        meta: { target: ["clinicId", "name"] },
      }),
      false,
    );
    assert.equal(
      isDuplicateActiveRecall({
        code: "P2002",
        meta: {
          target: ["clinicId", "patientId", "type", "customName", "dueDate"],
        },
      }),
      true,
    );
  });

  it("uses the due date in the active duplicate key to allow future cycles", () => {
    const migration = readFileSync(
      "prisma/migrations/20261015010000_preventive_recall_completion_and_deduplication/migration.sql",
      "utf8",
    );
    const uniqueIndex = migration.match(
      /CREATE UNIQUE INDEX "preventive_recalls_active_cycle_key"[\s\S]*?;/,
    )?.[0];
    assert.ok(uniqueIndex);
    assert.match(uniqueIndex, /"clinicId"/);
    assert.match(uniqueIndex, /"patientId"/);
    assert.match(uniqueIndex, /"type"/);
    assert.match(uniqueIndex, /"dueDate"/);
    assert.match(uniqueIndex, /WHERE "status" = 'ACTIVE'/);
    assert.doesNotMatch(uniqueIndex, /"intervalMonths"/);
  });

  it("records completion as terminal and only reschedules active recalls", () => {
    assert.equal(
      canTransitionRecallStatus(
        PreventiveRecallStatus.ACTIVE,
        PreventiveRecallStatus.COMPLETED,
      ),
      true,
    );
    assert.equal(
      canTransitionRecallStatus(
        PreventiveRecallStatus.COMPLETED,
        PreventiveRecallStatus.ACTIVE,
      ),
      false,
    );
    assert.equal(canRescheduleRecall(PreventiveRecallStatus.ACTIVE), true);
    assert.equal(canRescheduleRecall(PreventiveRecallStatus.PAUSED), false);
  });

  it("uses Asia/Kolkata for overdue comparisons and stores date-only values consistently", () => {
    const now = new Date("2026-10-15T19:00:00.000Z");
    const clinicToday = getClinicToday(now);
    assert.equal(clinicToday, "2026-10-16");
    assert.equal(
      isRecallOverdue(
        toDatabaseDate("2026-10-15"),
        PreventiveRecallStatus.ACTIVE,
        clinicToday,
      ),
      true,
    );
    assert.equal(
      isRecallOverdue(
        toDatabaseDate("2026-10-16"),
        PreventiveRecallStatus.ACTIVE,
        clinicToday,
      ),
      false,
    );
  });

  it("does not expose recall records across clinic boundaries", () => {
    assert.equal(
      recallBelongsToClinic({ clinicId: "clinic-a" }, "clinic-a"),
      true,
    );
    assert.equal(
      recallBelongsToClinic({ clinicId: "clinic-a" }, "clinic-b"),
      false,
    );
    assert.equal(recallBelongsToClinic(null, "clinic-a"), false);
  });
});

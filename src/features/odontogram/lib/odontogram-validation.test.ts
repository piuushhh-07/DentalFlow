import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OdontogramDentition,
  OdontogramEntryType,
  OdontogramFinding,
  OdontogramSurface,
  OdontogramTreatmentStatus,
} from "@prisma/client";

import {
  isValidFdiTooth,
  odontogramEntrySchema,
} from "@/features/odontogram/lib/odontogram-validation";

const findingEntry = {
  toothNumber: "16",
  dentition: OdontogramDentition.PERMANENT,
  entryType: OdontogramEntryType.FINDING,
  finding: OdontogramFinding.DECAYED,
  treatmentName: "",
  treatmentStatus: "",
  surfaces: [OdontogramSurface.OCCLUSAL],
  notes: "",
  treatmentPlanId: "",
  supersedesEntryId: "",
};

describe("odontogram validation", () => {
  it("accepts FDI permanent and primary teeth and rejects invalid quadrants", () => {
    assert.equal(isValidFdiTooth(OdontogramDentition.PERMANENT, 18), true);
    assert.equal(isValidFdiTooth(OdontogramDentition.PRIMARY, 55), true);
    assert.equal(isValidFdiTooth(OdontogramDentition.PERMANENT, 19), false);
    assert.equal(isValidFdiTooth(OdontogramDentition.PRIMARY, 56), false);
    assert.equal(
      odontogramEntrySchema.safeParse({
        ...findingEntry,
        toothNumber: "55",
      }).success,
      false,
    );
  });

  it("requires finding or treatment details that match the entry type", () => {
    assert.equal(odontogramEntrySchema.safeParse(findingEntry).success, true);
    assert.equal(
      odontogramEntrySchema.safeParse({
        ...findingEntry,
        entryType: OdontogramEntryType.TREATMENT,
      }).success,
      false,
    );
    assert.equal(
      odontogramEntrySchema.safeParse({
        ...findingEntry,
        entryType: OdontogramEntryType.TREATMENT,
        finding: "",
        treatmentName: "Root canal",
        treatmentStatus: OdontogramTreatmentStatus.PLANNED,
      }).success,
      true,
    );
  });

  it("rejects duplicated tooth surfaces and malformed optional references", () => {
    assert.equal(
      odontogramEntrySchema.safeParse({
        ...findingEntry,
        surfaces: [OdontogramSurface.MESIAL, OdontogramSurface.MESIAL],
      }).success,
      false,
    );
    assert.equal(
      odontogramEntrySchema.safeParse({
        ...findingEntry,
        treatmentPlanId: "not-a-uuid",
      }).success,
      false,
    );
  });
});

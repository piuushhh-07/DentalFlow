import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ClinicRole } from "@prisma/client";

import {
  authorizeClinicMembership,
  authorizeClinicRole,
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { createPrescriptionSchema } from "@/features/prescriptions/lib/prescription-validation";

const clinicId = "20000000-0000-4000-8000-000000000001";
const otherClinicId = "20000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000001";

const validPrescription = {
  prescriptionDate: "2026-11-02",
  followUpDate: "2026-11-12",
  authorConfirmed: true,
  saveToCatalogue: false,
  medicines: [
    {
      medicineName: "Dentist-entered medicine A",
      dosage: "One unit",
      route: "Oral",
      frequency: "As directed",
      duration: "Three days",
      quantity: "3 tablets",
      instructions: "Dentist-entered instruction",
    },
    {
      medicineName: "Dentist-entered medicine B",
      dosage: "One unit",
      route: "Topical",
      frequency: "Once daily",
      duration: "Five days",
      quantity: "1 tube",
      instructions: "",
    },
  ],
};

describe("digital prescription validation", () => {
  it("accepts multiple manually entered medicines and an optional visit", () => {
    const parsed = createPrescriptionSchema.safeParse({
      ...validPrescription,
      visitId: "30000000-0000-4000-8000-000000000001",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.medicines.length, 2);
  });

  it("rejects missing required medicine data and an empty medicine list", () => {
    assert.equal(
      createPrescriptionSchema.safeParse({
        ...validPrescription,
        medicines: [],
      }).success,
      false,
    );
    assert.equal(
      createPrescriptionSchema.safeParse({
        ...validPrescription,
        medicines: [{ ...validPrescription.medicines[0], dosage: "" }],
      }).success,
      false,
    );
  });

  it("requires author review and a valid prescription date", () => {
    assert.equal(
      createPrescriptionSchema.safeParse({
        ...validPrescription,
        authorConfirmed: false,
      }).success,
      false,
    );
    assert.equal(
      createPrescriptionSchema.safeParse({
        ...validPrescription,
        prescriptionDate: "2026-02-30",
      }).success,
      false,
    );
  });

  it("requires amendment reasons and prevents a follow-up before the prescription", () => {
    assert.equal(
      createPrescriptionSchema.safeParse({
        ...validPrescription,
        amendsPrescriptionId: "30000000-0000-4000-8000-000000000002",
      }).success,
      false,
    );
    assert.equal(
      createPrescriptionSchema.safeParse({
        ...validPrescription,
        followUpDate: "2026-11-01",
      }).success,
      false,
    );
    assert.equal(
      createPrescriptionSchema.safeParse({
        ...validPrescription,
        amendsPrescriptionId: "30000000-0000-4000-8000-000000000002",
        amendmentReason: "Correcting a dentist-entered mistake.",
      }).success,
      true,
    );
  });

  it("denies missing and cross-clinic author membership before a mutation", () => {
    assert.throws(
      () => authorizeClinicRole(null, [ClinicRole.OWNER, ClinicRole.STAFF]),
      ClinicRoleDeniedError,
    );
    assert.throws(
      () =>
        authorizeClinicMembership(userId, clinicId, {
          userId,
          clinicId: otherClinicId,
          role: ClinicRole.OWNER,
        }),
      ClinicAccessDeniedError,
    );
    assert.equal(
      authorizeClinicRole({ userId, clinicId, role: ClinicRole.OWNER }, [
        ClinicRole.OWNER,
        ClinicRole.STAFF,
      ]).clinicId,
      clinicId,
    );
  });
});

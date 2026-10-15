import assert from "node:assert/strict";
import test from "node:test";

import {
  getPatientPagination,
  hasDuplicatePatientPhoneError,
  patientBelongsToClinic,
  patientInputSchema,
  assertPatientWhatsAppConsent,
  PatientWhatsAppConsentRequiredError,
} from "@/features/patients/lib/patient-validation";
import { normalizeIndianPhoneNumber } from "@/features/onboarding/lib/validation";

const clinicOne = "20000000-0000-4000-8000-000000000001";
const clinicTwo = "20000000-0000-4000-8000-000000000002";

test("validates and normalizes a patient's Indian phone number", () => {
  const patient = patientInputSchema.parse({
    fullName: "  Asha Patel ",
    phoneNumber: "09876-543210",
    whatsappOptIn: true,
    notes: "  Follow-up requested ",
  });

  assert.equal(patient.fullName, "Asha Patel");
  assert.equal(patient.phoneNumber, "+919876543210");
  assert.equal(patient.whatsappOptedInAt instanceof Date, true);
  assert.equal(patient.notes, "Follow-up requested");
});

test("rejects invalid Indian mobile numbers", () => {
  const result = patientInputSchema.safeParse({
    fullName: "Asha Patel",
    phoneNumber: "+911234567890",
    whatsappOptIn: false,
    notes: "",
  });

  assert.equal(result.success, false);
  assert.equal(normalizeIndianPhoneNumber("12345"), null);
});

test("clears the consent timestamp when WhatsApp opt-in is false", () => {
  const patient = patientInputSchema.parse({
    fullName: "Asha Patel",
    phoneNumber: "9876543210",
    whatsappOptIn: false,
    notes: "",
  });

  assert.equal(patient.whatsappOptedInAt, null);
});

test("maps only the clinic-scoped normalized phone unique conflict", () => {
  assert.equal(
    hasDuplicatePatientPhoneError({
      code: "P2002",
      meta: { target: ["clinicId", "normalizedPhone"] },
    }),
    true,
  );
  assert.equal(
    hasDuplicatePatientPhoneError({
      code: "P2002",
      meta: { target: ["clinicId", "fullName"] },
    }),
    false,
  );
  assert.equal(
    hasDuplicatePatientPhoneError(new Error("database error")),
    false,
  );
});

test("pagination clamps to valid pages and calculates offsets", () => {
  assert.deepEqual(getPatientPagination(25, 2), {
    page: 2,
    pageSize: 10,
    totalCount: 25,
    totalPages: 3,
    skip: 10,
    hasPreviousPage: true,
    hasNextPage: true,
  });
  assert.equal(getPatientPagination(25, 99).page, 3);
  assert.equal(getPatientPagination(0, 0).page, 1);
  assert.equal(getPatientPagination(0, 1).totalPages, 1);
});

test("does not treat a patient from another clinic as accessible", () => {
  assert.equal(
    patientBelongsToClinic({ clinicId: clinicOne }, clinicOne),
    true,
  );
  assert.equal(
    patientBelongsToClinic({ clinicId: clinicTwo }, clinicOne),
    false,
  );
  assert.equal(patientBelongsToClinic(null, clinicOne), false);
});

test("requires recorded consent before WhatsApp follow-up", () => {
  const recordedConsent = {
    whatsappOptIn: true,
    whatsappOptedInAt: new Date(),
  };

  assert.doesNotThrow(() => assertPatientWhatsAppConsent(recordedConsent));
  assert.throws(
    () =>
      assertPatientWhatsAppConsent({
        whatsappOptIn: false,
        whatsappOptedInAt: null,
      }),
    PatientWhatsAppConsentRequiredError,
  );
  assert.throws(
    () =>
      assertPatientWhatsAppConsent({
        whatsappOptIn: true,
        whatsappOptedInAt: null,
      }),
    PatientWhatsAppConsentRequiredError,
  );
});

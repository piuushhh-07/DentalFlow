import assert from "node:assert/strict";
import test from "node:test";
import {
  AppointmentStatus,
  FinancialEntryType,
  PreventiveRecallStatus,
} from "@prisma/client";

import {
  buildPatient360Timeline,
  getPatient360AppointmentStatusPresentation,
  getPatient360FinancialEntryLabel,
  getPatient360MedicalAlerts,
  getPatient360PaymentCount,
  getPatient360RecallPresentation,
} from "@/features/patients/lib/patient-360";
import { patientBelongsToClinic } from "@/features/patients/lib/patient-validation";

const clinicId = "clinic-one";

test("Patient 360 records are only presented after clinic ownership is confirmed", () => {
  assert.equal(patientBelongsToClinic({ clinicId }, clinicId), true);
  assert.equal(
    patientBelongsToClinic({ clinicId: "clinic-two" }, clinicId),
    false,
  );
  assert.equal(patientBelongsToClinic(null, clinicId), false);
});

test("Patient 360 timeline is newest-first, stable for ties, and capped", () => {
  const timeline = buildPatient360Timeline(
    [
      {
        id: "older",
        occurredAt: new Date("2025-01-01T10:00:00Z"),
        kind: "appointment",
        title: "Appointment",
        href: "/appointments",
      },
      {
        id: "same-time-b",
        occurredAt: new Date("2025-01-02T10:00:00Z"),
        kind: "payment",
        title: "Payment",
        href: "/treatments",
      },
      {
        id: "same-time-a",
        occurredAt: new Date("2025-01-02T10:00:00Z"),
        kind: "clinical-record",
        title: "Clinical record",
        href: "#clinical-records",
      },
    ],
    2,
  );

  assert.deepEqual(
    timeline.map(({ id }) => id),
    ["same-time-a", "same-time-b"],
  );
});

test("Patient 360 timeline supports an empty history", () => {
  assert.deepEqual(buildPatient360Timeline([]), []);
});

test("Patient 360 uses the first, latest-ordered clinical record for alerts", () => {
  const clinicalRecords = [
    {
      allergies: "Penicillin",
      medicalHistory: "Asthma",
      createdAt: new Date("2026-11-08T10:00:00Z"),
    },
    {
      allergies: "Old allergy note",
      medicalHistory: "Old history note",
      createdAt: new Date("2026-10-08T10:00:00Z"),
    },
  ];

  assert.deepEqual(getPatient360MedicalAlerts(clinicalRecords), {
    allergies: "Penicillin",
    medicalHistory: "Asthma",
  });
  assert.deepEqual(getPatient360MedicalAlerts([]), {
    allergies: null,
    medicalHistory: null,
  });
});

test("Patient 360 labels financial entries and counts payment entries only", () => {
  assert.equal(
    getPatient360FinancialEntryLabel(FinancialEntryType.PAYMENT),
    "Payment",
  );
  assert.equal(
    getPatient360FinancialEntryLabel(FinancialEntryType.REFUND),
    "Refund",
  );
  assert.equal(
    getPatient360FinancialEntryLabel(FinancialEntryType.DISCOUNT),
    "Discount",
  );
  assert.equal(
    getPatient360PaymentCount([
      { entryType: FinancialEntryType.PAYMENT },
      { entryType: FinancialEntryType.REFUND },
      { entryType: FinancialEntryType.DISCOUNT },
      { entryType: FinancialEntryType.PAYMENT },
    ]),
    2,
  );
});

test("Patient 360 recall presentation follows status and clinic due date", () => {
  assert.deepEqual(
    getPatient360RecallPresentation(
      PreventiveRecallStatus.ACTIVE,
      new Date("2026-11-08T00:00:00.000Z"),
      "2026-11-09",
    ),
    { label: "Overdue", tone: "overdue" },
  );
  assert.deepEqual(
    getPatient360RecallPresentation(
      PreventiveRecallStatus.ACTIVE,
      new Date("2026-11-09T00:00:00.000Z"),
      "2026-11-09",
    ),
    { label: "Due today", tone: "due-today" },
  );
  assert.deepEqual(
    getPatient360RecallPresentation(
      PreventiveRecallStatus.ACTIVE,
      new Date("2026-11-10T00:00:00.000Z"),
      "2026-11-09",
    ),
    { label: "Upcoming", tone: "upcoming" },
  );
  assert.deepEqual(
    getPatient360RecallPresentation(
      PreventiveRecallStatus.PAUSED,
      new Date("2026-11-08T00:00:00.000Z"),
      "2026-11-09",
    ),
    { label: "Paused", tone: "neutral" },
  );
  assert.deepEqual(
    getPatient360RecallPresentation(
      PreventiveRecallStatus.COMPLETED,
      new Date("2026-11-08T00:00:00.000Z"),
      "2026-11-09",
    ),
    { label: "Completed", tone: "positive" },
  );
  assert.deepEqual(
    getPatient360RecallPresentation(
      PreventiveRecallStatus.ACTIVE,
      new Date(Number.NaN),
      "not-a-date",
    ),
    { label: "Active", tone: "neutral" },
  );
});

test("Patient 360 clearly distinguishes cancelled past appointments", () => {
  assert.deepEqual(
    getPatient360AppointmentStatusPresentation(AppointmentStatus.CANCELLED),
    { label: "Cancelled", tone: "cancelled" },
  );
});

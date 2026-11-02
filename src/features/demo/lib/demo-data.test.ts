import assert from "node:assert/strict";
import test from "node:test";

import { createInitialDemoData } from "@/features/demo/lib/demo-data";

function todayInClinicTimeZone() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

test("demo reset data covers the complete dentist walkthrough", () => {
  const data = createInitialDemoData();
  const todayAppointments = data.appointments.filter(
    (appointment) => appointment.date === todayInClinicTimeZone(),
  );

  assert.ok(data.patients.length >= 15 && data.patients.length <= 20);
  assert.ok(todayAppointments.length >= 5);
  assert.ok(
    new Set(todayAppointments.map((appointment) => appointment.status)).size >=
      4,
  );
  assert.ok(data.treatmentPlans.length >= 2);
  assert.ok(data.clinicalRecords.length > 0);
  assert.ok(data.odontogramEntries.length > 0);
  assert.ok(data.estimates.length > 0);
  assert.ok(data.prescriptions.length > 0);
  assert.ok(data.insuranceClaims.length >= 2);
  assert.ok(data.payments.length > 0);
  assert.ok(
    data.patients.every((patient) =>
      patient.phone.endsWith(String(patient.id.slice(-3)).padStart(5, "0")),
    ),
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentStatus } from "@prisma/client";

import {
  appointmentsConflict,
  canTransitionAppointment,
  createAppointmentSchema,
  isActiveAppointmentStatus,
} from "@/features/appointments/lib/appointment-validation";

test("validates appointment details and linked database IDs", () => {
  const valid = createAppointmentSchema.safeParse({
    patientId: "20000000-0000-4000-8000-000000000001",
    treatmentVisitId: "",
    date: "2026-10-21",
    time: "09:30",
    durationMinutes: "45",
    dentistName: "Dr. Shah",
    chairLabel: "Chair 1",
    type: "Review",
    notes: "",
  });
  assert.equal(valid.success, true);
  assert.equal(valid.success && valid.data.treatmentVisitId, null);

  assert.equal(
    createAppointmentSchema.safeParse({
      patientId: "not-an-id",
      treatmentVisitId: "",
      date: "2026-13-40",
      time: "29:10",
      durationMinutes: "600",
      dentistName: "",
      chairLabel: "",
      type: "",
      notes: "",
    }).success,
    false,
  );
});

test("detects overlapping appointments for the same dentist or chair", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistName: "Dr. Shah",
      chairLabel: "Chair 1",
      status: AppointmentStatus.CONFIRMED,
    },
  ];

  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 15 * 60_000),
        durationMinutes: 30,
        dentistName: "Dr. Shah",
        chairLabel: "Chair 2",
      },
      existing,
    ),
    true,
  );
  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 15 * 60_000),
        durationMinutes: 30,
        dentistName: "Dr. Rao",
        chairLabel: "Chair 1",
      },
      existing,
    ),
    true,
  );
  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 45 * 60_000),
        durationMinutes: 30,
        dentistName: "Dr. Shah",
        chairLabel: "Chair 2",
      },
      existing,
    ),
    false,
  );
});

test("appointment state transitions cannot reopen completed bookings", () => {
  assert.equal(
    canTransitionAppointment(
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.CONFIRMED,
    ),
    true,
  );
  assert.equal(
    canTransitionAppointment(
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.SCHEDULED,
    ),
    true,
  );
  assert.equal(
    canTransitionAppointment(
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
    ),
    false,
  );
});

test("only non-terminal appointments count as active treatment bookings", () => {
  assert.equal(isActiveAppointmentStatus(AppointmentStatus.SCHEDULED), true);
  assert.equal(isActiveAppointmentStatus(AppointmentStatus.CONFIRMED), true);
  assert.equal(isActiveAppointmentStatus(AppointmentStatus.IN_PROGRESS), true);
  assert.equal(isActiveAppointmentStatus(AppointmentStatus.COMPLETED), false);
  assert.equal(isActiveAppointmentStatus(AppointmentStatus.CANCELLED), false);
  assert.equal(isActiveAppointmentStatus(AppointmentStatus.NO_SHOW), false);
});

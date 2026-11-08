import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentStatus } from "@prisma/client";

import {
  appointmentsConflict,
  canTransitionAppointment,
  createAppointmentSchema,
  isWithinDentistWorkingHours,
  isActiveAppointmentStatus,
} from "@/features/appointments/lib/appointment-validation";

test("validates appointment details and linked database IDs", () => {
  const valid = createAppointmentSchema.safeParse({
    patientId: "20000000-0000-4000-8000-000000000001",
    treatmentVisitId: "",
    date: "2026-10-21",
    time: "09:30",
    durationMinutes: "45",
    dentistId: "20000000-0000-4000-8000-000000000002",
    chairId: "20000000-0000-4000-8000-000000000003",
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
      dentistId: "not-an-id",
      chairId: "",
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

test("dentist IDs distinguish same-named dentists and chairs still conflict", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistName: "Dr. Shah",
      dentistId: "dentist-1",
      chairLabel: "Chair 1",
      chairId: "chair-1",
      status: AppointmentStatus.CONFIRMED,
    },
  ];
  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 10 * 60_000),
        durationMinutes: 20,
        dentistName: "Dr. Shah",
        dentistId: "dentist-2",
        chairLabel: "Chair 2",
        chairId: "chair-2",
      },
      existing,
    ),
    false,
  );
  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 10 * 60_000),
        durationMinutes: 20,
        dentistName: "Another dentist",
        dentistId: "dentist-2",
        chairLabel: "Chair 1",
        chairId: "chair-1",
      },
      existing,
    ),
    true,
  );
});

test("dentist availability checks weekday, opening time, and full appointment duration", () => {
  const availability = [
    {
      dayOfWeek: 3,
      isWorking: true,
      startTime: "09:00",
      endTime: "17:00",
    },
  ];
  assert.equal(
    isWithinDentistWorkingHours(availability, "2026-10-21", "09:00", 30),
    true,
  );
  assert.equal(
    isWithinDentistWorkingHours(availability, "2026-10-21", "16:45", 30),
    false,
  );
  assert.equal(
    isWithinDentistWorkingHours(availability, "2026-10-20", "10:00", 30),
    false,
  );
  assert.equal(
    isWithinDentistWorkingHours(null, "2026-10-20", "10:00", 30),
    true,
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

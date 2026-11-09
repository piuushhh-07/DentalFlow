import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentStatus } from "@prisma/client";

import {
  appointmentsConflict,
  canTransitionAppointment,
  createAppointmentSchema,
  dentistNameSchema,
  chairLabelSchema,
  isActiveAppointmentStatus,
} from "@/features/appointments/lib/appointment-validation";
import {
  authorizeClinicMembership,
  authorizeClinicRole,
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { ClinicRole } from "@prisma/client";

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

test("detects overlapping appointments by dentist and chair resource IDs", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const dentistId = "10000000-0000-4000-8000-000000000001";
  const chairId = "10000000-0000-4000-8000-000000000002";
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistId,
      chairId,
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
        dentistId,
        chairId: "10000000-0000-4000-8000-000000000003",
        dentistName: "Dr. Rao",
        chairLabel: "Chair 2",
      },
      existing,
    ),
    true,
    "same dentist ID should overlap even when the snapshot name differs",
  );
  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 15 * 60_000),
        durationMinutes: 30,
        dentistId: "10000000-0000-4000-8000-000000000004",
        chairId,
        dentistName: "Dr. Rao",
        chairLabel: "Chair 2",
      },
      existing,
    ),
    true,
    "same chair ID should overlap even when the snapshot label differs",
  );
});

test("resource IDs prevent false conflicts when snapshot names are identical", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistId: "10000000-0000-4000-8000-000000000001",
      chairId: "10000000-0000-4000-8000-000000000002",
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
        dentistId: "10000000-0000-4000-8000-000000000011",
        chairId: "10000000-0000-4000-8000-000000000012",
        dentistName: "dr. shah",
        chairLabel: "chair 1",
      },
      existing,
    ),
    false,
  );
});

test("different dentist and chair IDs do not conflict", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistId: "10000000-0000-4000-8000-000000000001",
      chairId: "10000000-0000-4000-8000-000000000002",
      dentistName: "Dr. Shah",
      chairLabel: "Chair 1",
      status: AppointmentStatus.CONFIRMED,
    },
  ];

  assert.equal(
    appointmentsConflict(
      {
        startAt,
        durationMinutes: 30,
        dentistId: "10000000-0000-4000-8000-000000000003",
        chairId: "10000000-0000-4000-8000-000000000004",
        dentistName: "Dr. Rao",
        chairLabel: "Chair 2",
      },
      existing,
    ),
    false,
  );
});

test("back-to-back appointments remain allowed", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 30,
      dentistId: "10000000-0000-4000-8000-000000000001",
      chairId: "10000000-0000-4000-8000-000000000002",
      dentistName: "Dr. Shah",
      chairLabel: "Chair 1",
      status: AppointmentStatus.CONFIRMED,
    },
  ];

  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 30 * 60_000),
        durationMinutes: 30,
        dentistId: "10000000-0000-4000-8000-000000000001",
        chairId: "10000000-0000-4000-8000-000000000002",
        dentistName: "Dr. Shah",
        chairLabel: "Chair 1",
      },
      existing,
    ),
    false,
  );
});

test("legacy null resource IDs use case-insensitive name and label fallbacks", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistId: null,
      chairId: null,
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
        dentistId: "10000000-0000-4000-8000-000000000001",
        chairId: "10000000-0000-4000-8000-000000000002",
        dentistName: "dr. shah",
        chairLabel: "chair 9",
      },
      existing,
    ),
    true,
    "legacy dentist snapshots should match case-insensitively",
  );
  assert.equal(
    appointmentsConflict(
      {
        startAt: new Date(startAt.getTime() + 15 * 60_000),
        durationMinutes: 30,
        dentistId: "10000000-0000-4000-8000-000000000003",
        chairId: "10000000-0000-4000-8000-000000000004",
        dentistName: "Dr. Rao",
        chairLabel: "CHAIR 1",
      },
      existing,
    ),
    true,
    "legacy chair snapshots should match case-insensitively",
  );
});

test("updating an appointment excludes itself from conflict detection", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "appointment-1",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistId: "10000000-0000-4000-8000-000000000001",
      chairId: "10000000-0000-4000-8000-000000000002",
      dentistName: "Dr. Shah",
      chairLabel: "Chair 1",
      status: AppointmentStatus.CONFIRMED,
    },
  ];

  assert.equal(
    appointmentsConflict(
      {
        id: "appointment-1",
        startAt,
        durationMinutes: 45,
        dentistId: "10000000-0000-4000-8000-000000000001",
        chairId: "10000000-0000-4000-8000-000000000002",
        dentistName: "Dr. Shah",
        chairLabel: "Chair 1",
      },
      existing,
    ),
    false,
  );
});

test("cancelled and no-show appointments do not block scheduling", () => {
  const startAt = new Date("2026-10-21T04:00:00.000Z");
  const existing = [
    {
      id: "cancelled",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistId: "10000000-0000-4000-8000-000000000001",
      chairId: "10000000-0000-4000-8000-000000000002",
      dentistName: "Dr. Shah",
      chairLabel: "Chair 1",
      status: AppointmentStatus.CANCELLED,
    },
    {
      id: "no-show",
      scheduledAt: startAt,
      durationMinutes: 45,
      dentistId: "10000000-0000-4000-8000-000000000001",
      chairId: "10000000-0000-4000-8000-000000000002",
      dentistName: "Dr. Shah",
      chairLabel: "Chair 1",
      status: AppointmentStatus.NO_SHOW,
    },
  ];

  assert.equal(
    appointmentsConflict(
      {
        startAt,
        durationMinutes: 30,
        dentistId: "10000000-0000-4000-8000-000000000001",
        chairId: "10000000-0000-4000-8000-000000000002",
        dentistName: "Dr. Shah",
        chairLabel: "Chair 1",
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

test("schedule resource names are normalized before create or rename", () => {
  const dentist = dentistNameSchema.safeParse("  Dr.   Shah  ");
  const chair = chairLabelSchema.safeParse("  Chair   1  ");

  assert.equal(dentist.success && dentist.data, "Dr. Shah");
  assert.equal(chair.success && chair.data, "Chair 1");
});

test("only OWNER membership can authorize schedule resource mutations", () => {
  const clinicId = "20000000-0000-4000-8000-000000000001";
  const userId = "20000000-0000-4000-8000-000000000002";
  const owner = {
    userId,
    clinicId,
    role: ClinicRole.OWNER,
  };
  const staff = {
    userId,
    clinicId,
    role: ClinicRole.STAFF,
  };

  assert.equal(
    authorizeClinicRole(owner, [ClinicRole.OWNER]).role,
    ClinicRole.OWNER,
  );
  assert.throws(
    () => authorizeClinicRole(staff, [ClinicRole.OWNER]),
    ClinicRoleDeniedError,
  );
  assert.throws(
    () =>
      authorizeClinicRole(null, [ClinicRole.OWNER]),
    ClinicRoleDeniedError,
  );
  assert.throws(
    () =>
      authorizeClinicMembership(
        userId,
        clinicId,
        {
          ...owner,
          clinicId: "20000000-0000-4000-8000-000000000099",
        },
      ),
    ClinicAccessDeniedError,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import type {
  DemoAppointment,
  DemoTreatmentPlan,
} from "@/features/demo/lib/demo-types";
import {
  appointmentConflict,
  canPrepareWhatsApp,
  canTransitionAppointment,
  createWhatsAppUrl,
  pendingRecallCount,
  prioritizeFollowUp,
  renderDemoMessage,
  treatmentValues,
  updateRecallDueDate,
  validateAppointmentInput,
} from "@/features/demo/lib/demo-rules";

const today = "2026-10-19";

const appointments: DemoAppointment[] = [
  {
    id: "apt-1",
    patientId: "pt-1",
    date: "2026-10-19",
    time: "09:30",
    durationMinutes: 45,
    dentist: "Dr. A",
    chair: "Chair 1",
    type: "Consultation",
    status: "SCHEDULED",
    notes: "",
    planId: null,
    stageId: null,
  },
  {
    id: "apt-2",
    patientId: "pt-2",
    date: "2026-10-19",
    time: "10:30",
    durationMinutes: 60,
    dentist: "Dr. B",
    chair: "Chair 2",
    type: "Scaling",
    status: "CONFIRMED",
    notes: "",
    planId: null,
    stageId: null,
  },
];

const plans: DemoTreatmentPlan[] = [
  {
    id: "plan-1",
    patientId: "pt-1",
    name: "Root canal",
    createdAt: "2026-09-12",
    clinicalNotes: "Demo notes",
    priority: "ROUTINE",
    acceptance: "ACCEPTED",
    acceptanceDate: "2026-09-13",
    procedures: [
      {
        id: "proc-1",
        name: "Root canal",
        treatmentArea: "Tooth 16",
        amount: 15000,
        acceptance: "ACCEPTED",
      },
      {
        id: "proc-2",
        name: "Crown",
        treatmentArea: "Tooth 16",
        amount: 12000,
        acceptance: "DEFERRED",
      },
    ],
    stages: [
      {
        id: "stage-1",
        name: "Root canal",
        description: "",
        sequence: 1,
        plannedDate: "2026-09-20",
        status: "COMPLETED",
        appointmentId: null,
        notes: "",
      },
      {
        id: "stage-2",
        name: "Crown",
        description: "",
        sequence: 2,
        plannedDate: "2026-10-25",
        status: "PLANNED",
        appointmentId: null,
        notes: "",
      },
    ],
  },
];

test("appointment transitions follow the safe clinic schedule rules", () => {
  assert.equal(canTransitionAppointment("SCHEDULED", "CONFIRMED"), true);
  assert.equal(canTransitionAppointment("SCHEDULED", "NO_SHOW"), true);
  assert.equal(canTransitionAppointment("CONFIRMED", "CANCELLED"), true);
  assert.equal(canTransitionAppointment("COMPLETED", "CANCELLED"), false);
});

test("appointment conflicts are detected for dentist or chair collisions", () => {
  const conflict = appointmentConflict(
    {
      id: "apt-3",
      date: "2026-10-19",
      time: "09:45",
      durationMinutes: 30,
      dentist: "Dr. A",
      chair: "Chair 3",
    },
    appointments,
  );
  assert.equal(conflict, "dentist");

  const chairConflict = appointmentConflict(
    {
      id: "apt-4",
      date: "2026-10-19",
      time: "10:00",
      durationMinutes: 60,
      dentist: "Dr. C",
      chair: "Chair 2",
    },
    appointments,
  );
  assert.equal(chairConflict, "chair");
});

test("appointment input validation catches invalid dates and durations", () => {
  assert.equal(
    validateAppointmentInput({
      date: "2026-10-19",
      time: "09:30",
      durationMinutes: 30,
      dentist: "Dr. A",
      chair: "Chair 1",
      patientId: "pt-1",
    }),
    null,
  );
  assert.match(
    validateAppointmentInput({
      date: "2026-13-32",
      time: "09:30",
      durationMinutes: 30,
      dentist: "Dr. A",
      chair: "Chair 1",
      patientId: "pt-1",
    }) ?? "",
    /valid date/i,
  );
  assert.match(
    validateAppointmentInput({
      date: "2026-10-19",
      time: "25:00",
      durationMinutes: 30,
      dentist: "Dr. A",
      chair: "Chair 1",
      patientId: "pt-1",
    }) ?? "",
    /valid start time/i,
  );
});

test("treatment values summarize planned and accepted amounts", () => {
  assert.deepEqual(treatmentValues(plans), {
    proposed: 27000,
    accepted: 15000,
    deferred: 12000,
    completed: 0,
  });
});

test("recall dates advance by month while preserving valid day boundaries", () => {
  assert.equal(updateRecallDueDate("2026-01-31", 1), "2026-02-28");
  assert.equal(updateRecallDueDate("2026-03-30", 2), "2026-05-30");
});

test("follow-up priority uses overdue and consent-aware messaging status", () => {
  const priority = prioritizeFollowUp(
    {
      id: "fu-1",
      patientId: "pt-1",
      planId: "plan-1",
      appointmentId: null,
      kind: "TREATMENT",
      dueDate: "2026-10-15",
      status: "PENDING",
      lastOutcome: "Awaiting response",
      notes: "",
    },
    today,
    "GRANTED",
  );

  assert.deepEqual(priority, {
    priority: "Medium",
    explanation: "4 days overdue.",
    daysOverdue: 4,
  });

  const optedOut = prioritizeFollowUp(
    {
      id: "fu-2",
      patientId: "pt-2",
      planId: null,
      appointmentId: null,
      kind: "MISSED_APPOINTMENT",
      dueDate: "2026-10-18",
      status: "PENDING",
      lastOutcome: "Missed appointment",
      notes: "",
    },
    today,
    "OPTED_OUT",
  );

  assert.equal(optedOut.priority, "High");
  assert.match(optedOut.explanation, /opted out/i);
});

test("WhatsApp prep only allows consented patients and renders templates safely", () => {
  assert.equal(canPrepareWhatsApp("GRANTED"), true);
  assert.equal(canPrepareWhatsApp("NOT_RECORDED"), false);

  const text = renderDemoMessage(
    {
      id: "tpl-1",
      name: "Reminder",
      content: "Hello {{patient_name}}, please call {{clinic_phone}}.",
    },
    { patient_name: "Anu", clinic_phone: "+91 98765 43210" },
  );

  assert.equal(text, "Hello Anu, please call +91 98765 43210.");

  assert.equal(
    createWhatsAppUrl("+91 98765 43210", "Hi there", "GRANTED"),
    "https://wa.me/919876543210?text=Hi%20there",
  );
  assert.throws(
    () => createWhatsAppUrl("+91 98765 43210", "Hi there", "NOT_RECORDED"),
    /consent/i,
  );
});

test("pending recall count only includes active due recalls", () => {
  assert.equal(
    pendingRecallCount(
      [
        {
          id: "rec-1",
          patientId: "pt-1",
          type: "Cleaning",
          lastVisit: "2026-04-05",
          intervalMonths: 6,
          dueDate: "2026-10-18",
          status: "ACTIVE",
          dentistConfirmed: true,
        },
        {
          id: "rec-2",
          patientId: "pt-2",
          type: "Checkup",
          lastVisit: "2026-04-05",
          intervalMonths: 6,
          dueDate: "2026-10-20",
          status: "ACTIVE",
          dentistConfirmed: false,
        },
        {
          id: "rec-3",
          patientId: "pt-3",
          type: "Recall",
          lastVisit: "2026-04-05",
          intervalMonths: 6,
          dueDate: "2026-10-21",
          status: "COMPLETED",
          dentistConfirmed: true,
        },
      ],
      "2026-10-19",
    ),
    1,
  );
});

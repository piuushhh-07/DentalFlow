import type {
  DemoAppointment,
  DemoAppointmentStatus,
  DemoConsent,
  DemoFollowUp,
  DemoMessageTemplate,
  DemoRecall,
  DemoTreatmentPlan,
} from "@/features/demo/lib/demo-types";

const allowedTransitions: Record<
  DemoAppointmentStatus,
  readonly DemoAppointmentStatus[]
> = {
  SCHEDULED: ["CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointment(
  current: DemoAppointmentStatus,
  next: DemoAppointmentStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

export function appointmentConflict(
  candidate: Pick<
    DemoAppointment,
    "id" | "date" | "time" | "durationMinutes" | "dentist" | "chair"
  >,
  appointments: readonly DemoAppointment[],
): "dentist" | "chair" | null {
  const start = toMinutes(candidate.time);
  const end = start + candidate.durationMinutes;
  for (const appointment of appointments) {
    if (
      appointment.id === candidate.id ||
      appointment.date !== candidate.date ||
      ["CANCELLED", "NO_SHOW"].includes(appointment.status)
    ) {
      continue;
    }
    const otherStart = toMinutes(appointment.time);
    const otherEnd = otherStart + appointment.durationMinutes;
    if (start >= otherEnd || otherStart >= end) continue;
    if (appointment.dentist === candidate.dentist) return "dentist";
    if (appointment.chair === candidate.chair) return "chair";
  }
  return null;
}

export function validateAppointmentInput(input: {
  date: string;
  time: string;
  durationMinutes: number;
  dentist: string;
  chair: string;
  patientId: string;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Choose a valid date.";
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.date
  ) {
    return "Choose a valid date.";
  }
  if (!/^\d{2}:\d{2}$/.test(input.time) || toMinutes(input.time) >= 24 * 60) {
    return "Choose a valid start time.";
  }
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 10 ||
    input.durationMinutes > 240
  ) {
    return "Duration must be between 10 and 240 minutes.";
  }
  if (!input.dentist || !input.chair || !input.patientId) {
    return "Choose a patient, clinician and chair.";
  }
  return null;
}

export function treatmentValues(plans: readonly DemoTreatmentPlan[]) {
  return plans.reduce(
    (totals, plan) => {
      for (const procedure of plan.procedures) {
        totals.proposed += procedure.amount;
        if (procedure.acceptance === "ACCEPTED") {
          totals.accepted += procedure.amount;
          if (
            plan.stages.every(
              (stage) =>
                stage.status === "COMPLETED" || stage.status === "SKIPPED",
            )
          ) {
            totals.completed += procedure.amount;
          }
        } else {
          totals.deferred += procedure.amount;
        }
      }
      return totals;
    },
    { proposed: 0, accepted: 0, deferred: 0, completed: 0 },
  );
}

export function updateRecallDueDate(
  lastVisit: string,
  intervalMonths: number,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastVisit);
  if (
    !match ||
    !Number.isInteger(intervalMonths) ||
    intervalMonths < 1 ||
    intervalMonths > 60
  ) {
    throw new Error("Enter a valid last visit date and recall interval.");
  }
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (date.toISOString().slice(0, 10) !== lastVisit) {
    throw new Error("Enter a valid last visit date and recall interval.");
  }
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + intervalMonths);
  const monthEnd = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(originalDay, monthEnd));
  return date.toISOString().slice(0, 10);
}

export function prioritizeFollowUp(
  followUp: DemoFollowUp,
  today: string,
  consent: DemoConsent,
) {
  const daysOverdue = Math.max(
    0,
    Math.floor(
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${followUp.dueDate}T00:00:00Z`)) /
        86_400_000,
    ),
  );
  const high =
    followUp.kind === "MISSED_APPOINTMENT" ||
    (followUp.kind === "TREATMENT" && daysOverdue >= 7);
  const priority = high ? "High" : daysOverdue > 0 ? "Medium" : "Low";
  const explanation =
    followUp.kind === "MISSED_APPOINTMENT"
      ? "Missed appointment requires a scheduling follow-up."
      : daysOverdue > 0
        ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.`
        : "Due today or upcoming.";
  return {
    priority,
    explanation:
      consent === "OPTED_OUT"
        ? `${explanation} Patient has opted out of WhatsApp.`
        : consent === "NOT_RECORDED"
          ? `${explanation} WhatsApp consent is not recorded.`
          : explanation,
    daysOverdue,
  } as const;
}

export function canPrepareWhatsApp(consent: DemoConsent): boolean {
  return consent === "GRANTED";
}

export function renderDemoMessage(
  template: DemoMessageTemplate,
  values: Readonly<Record<string, string | null | undefined>>,
): string {
  return template.content
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
      const value = values[key.toLowerCase()];
      return value && value !== "null" && value !== "undefined" ? value : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}

export function createWhatsAppUrl(
  phone: string,
  message: string,
  consent: DemoConsent,
): string {
  if (!canPrepareWhatsApp(consent)) {
    throw new Error(
      "Recorded WhatsApp consent is required for this demo action.",
    );
  }
  const digits = phone.replace(/\D/g, "");
  if (!/^91[6-9]\d{9}$/.test(digits)) {
    throw new Error("The fictional demo phone number is invalid.");
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function pendingRecallCount(
  recalls: readonly DemoRecall[],
  today: string,
) {
  return recalls.filter(
    (recall) => recall.status === "ACTIVE" && recall.dueDate <= today,
  ).length;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return -1;
  return hours * 60 + minutes;
}

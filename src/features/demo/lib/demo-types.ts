export type DemoConsent = "GRANTED" | "NOT_RECORDED" | "OPTED_OUT";
export type DemoAppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
export type DemoStageStatus =
  | "PLANNED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED";
export type DemoAcceptance =
  | "DRAFT"
  | "PRESENTED"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "DECLINED"
  | "ON_HOLD"
  | "IN_PROGRESS"
  | "COMPLETED";

export type DemoPatient = {
  id: string;
  name: string;
  age: number;
  phone: string;
  email: string;
  lastVisit: string;
  consent: DemoConsent;
  consentSource: string | null;
  consentRecordedAt: string | null;
  notes: string;
};

export type DemoAppointment = {
  id: string;
  patientId: string;
  date: string;
  time: string;
  durationMinutes: number;
  dentist: string;
  chair: string;
  type: string;
  status: DemoAppointmentStatus;
  notes: string;
  planId: string | null;
  stageId: string | null;
};

export type DemoProcedure = {
  id: string;
  name: string;
  treatmentArea: string;
  amount: number;
  acceptance: "ACCEPTED" | "DEFERRED" | "DECLINED";
};

export type DemoStage = {
  id: string;
  name: string;
  description: string;
  sequence: number;
  plannedDate: string;
  status: DemoStageStatus;
  appointmentId: string | null;
  notes: string;
};

export type DemoTreatmentPlan = {
  id: string;
  patientId: string;
  name: string;
  createdAt: string;
  clinicalNotes: string;
  priority: "ROUTINE" | "CLINICIAN_DEFINED_SOON";
  acceptance: DemoAcceptance;
  acceptanceDate: string | null;
  procedures: DemoProcedure[];
  stages: DemoStage[];
};

export type DemoRecall = {
  id: string;
  patientId: string;
  type: string;
  lastVisit: string;
  intervalMonths: number;
  dueDate: string;
  status: "ACTIVE" | "COMPLETED" | "PAUSED";
  dentistConfirmed: boolean;
};

export type DemoFollowUp = {
  id: string;
  patientId: string;
  planId: string | null;
  appointmentId: string | null;
  kind: "TREATMENT" | "MISSED_APPOINTMENT" | "RECALL" | "RESPONSE";
  dueDate: string;
  status: "PENDING" | "CONTACTED" | "NO_ANSWER" | "COMPLETED";
  lastOutcome: string;
  notes: string;
};

export type DemoMessageTemplate = {
  id: string;
  name: string;
  content: string;
};

export type DemoMessage = {
  id: string;
  patientId: string;
  templateName: string;
  snapshot: string;
  status: "PREPARED" | "OPENED_IN_WHATSAPP";
  createdAt: string;
};

export type DemoData = {
  version: 1;
  patients: DemoPatient[];
  appointments: DemoAppointment[];
  treatmentPlans: DemoTreatmentPlan[];
  recalls: DemoRecall[];
  followUps: DemoFollowUp[];
  templates: DemoMessageTemplate[];
  messages: DemoMessage[];
};

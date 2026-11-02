"use client";

import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Plus,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  DemoProvider,
  useDemoData,
} from "@/features/demo/components/demo-provider";
import { DemoClinicalWorkflow } from "@/features/demo/components/demo-clinical-workflow";
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
import type {
  DemoAcceptance,
  DemoAppointment,
  DemoAppointmentStatus,
  DemoData,
  DemoFollowUp,
  DemoPatient,
  DemoRecall,
  DemoStageStatus,
} from "@/features/demo/lib/demo-types";

const clinicName = "Sunrise Dental Studio";
const clinicPhone = "+91 98765 43210";
const tabs = [
  "Overview",
  "Appointments",
  "Patients",
  "Treatment plans",
  "Follow-ups",
  "Messages",
] as const;
type Tab = (typeof tabs)[number];

export function DemoWorkspace() {
  return (
    <DemoProvider>
      <DemoWorkspaceInner />
    </DemoProvider>
  );
}

function DemoWorkspaceInner() {
  const { data, ready, storageWarning, updateData, reset } = useDemoData();
  const [tab, setTab] = useState<Tab>("Overview");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [appointmentError, setAppointmentError] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(todayKey());
  const [appointmentForPatientId, setAppointmentForPatientId] = useState<
    string | null
  >(null);
  const [appointmentFormOpen, setAppointmentFormOpen] = useState(false);
  const [patientFormOpen, setPatientFormOpen] = useState(false);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [createPlanForPatientId, setCreatePlanForPatientId] = useState<
    string | null
  >(null);
  const [recallFormOpen, setRecallFormOpen] = useState(false);
  const [followUpFormOpen, setFollowUpFormOpen] = useState(false);
  const [messagePatientId, setMessagePatientId] = useState("");
  const [messageTemplateId, setMessageTemplateId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messageRelatedId, setMessageRelatedId] = useState("");
  const [preparedMessageId, setPreparedMessageId] = useState<string | null>(
    null,
  );

  const selectedPatient = data.patients.find(
    (patient) => patient.id === selectedPatientId,
  );
  const filteredPatients = data.patients.filter((patient) =>
    `${patient.name} ${patient.phone}`
      .toLowerCase()
      .includes(patientSearch.toLowerCase()),
  );

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Loading local demo…
      </div>
    );
  }

  const totals = treatmentValues(data.treatmentPlans);
  const today = todayKey();
  const appointmentsToday = data.appointments.filter(
    (appointment) =>
      appointment.date === today &&
      !["CANCELLED", "NO_SHOW"].includes(appointment.status),
  );
  const recallsDue = pendingRecallCount(data.recalls, today);
  const pendingFollowUps = data.followUps.filter(
    (followUp) => followUp.status !== "COMPLETED",
  );

  function selectPatient(patientId: string) {
    setSelectedPatientId(patientId);
    setTab("Patients");
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-2xl bg-gradient-to-r from-teal-900 via-teal-800 to-sky-900 p-5 text-white shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">
                Local demo workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {clinicName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-teal-50/90">
                Work through a fictional clinic day. Changes save in this
                browser only; nothing is sent to the DentalFlow database.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
                onClick={() => {
                  if (window.confirm("Reset all local demo changes?")) {
                    reset();
                    setSelectedPatientId(null);
                    setTab("Overview");
                    showNotice("Demo data has been reset.");
                  }
                }}
                type="button"
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Reset demo
              </button>
              <a
                className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50"
                href="/"
              >
                Exit demo
              </a>
            </div>
          </div>
        </header>

        {storageWarning ? <Alert>{storageWarning}</Alert> : null}
        {notice ? (
          <p
            aria-live="polite"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          >
            {notice}
          </p>
        ) : null}

        <nav
          aria-label="Demo workspace sections"
          className="sticky top-0 z-10 -mx-4 mt-5 overflow-x-auto border-b border-slate-200 bg-slate-100/95 px-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:p-2"
        >
          <div className="flex min-w-max gap-1">
            {tabs.map((item) => (
              <button
                aria-current={tab === item ? "page" : undefined}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  tab === item
                    ? "bg-teal-800 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                key={item}
                onClick={() => setTab(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </nav>

        {tab === "Overview" ? (
          <Overview
            appointments={appointmentsToday}
            data={data}
            followUps={pendingFollowUps}
            onAddAppointment={() => {
              setAppointmentFormOpen(true);
              setTab("Appointments");
            }}
            onOpenPatient={selectPatient}
            recallsDue={recallsDue}
            totals={totals}
          />
        ) : null}

        {tab === "Appointments" ? (
          <Appointments
            key={appointmentForPatientId ?? "all"}
            appointmentDate={appointmentDate}
            appointments={data.appointments}
            data={data}
            error={appointmentError}
            formOpen={appointmentFormOpen}
            initialPatientId={appointmentForPatientId}
            onAdd={() => {
              setAppointmentError("");
              setAppointmentFormOpen(true);
            }}
            onDateChange={setAppointmentDate}
            onPatient={selectPatient}
            onPrepareConfirmation={(appointment) => {
              setMessagePatientId(appointment.patientId);
              setMessageTemplateId("tpl-appointment");
              setMessageRelatedId(`appointment:${appointment.id}`);
              setMessageText("");
              setPreparedMessageId(null);
              setTab("Messages");
            }}
            onSave={(formData) => {
              const error = validateAppointmentInput(formData);
              if (error) {
                setAppointmentError(error);
                return;
              }
              if (formData.planId || formData.stageId) {
                const linkedPlan = data.treatmentPlans.find(
                  (plan) => plan.id === formData.planId,
                );
                const linkedStage = linkedPlan?.stages.find(
                  (stage) => stage.id === formData.stageId,
                );
                if (
                  !linkedPlan ||
                  !linkedStage ||
                  linkedPlan.patientId !== formData.patientId
                ) {
                  setAppointmentError(
                    "Choose a treatment stage belonging to this patient.",
                  );
                  return;
                }
              }
              const candidate: DemoAppointment = {
                ...formData,
                id: newId("apt"),
                type: formData.type.trim(),
                notes: formData.notes.trim(),
                status: "SCHEDULED",
              };
              const conflict = appointmentConflict(
                candidate,
                data.appointments,
              );
              if (conflict) {
                setAppointmentError(
                  conflict === "dentist"
                    ? "That clinician already has an overlapping appointment."
                    : "That chair already has an overlapping appointment.",
                );
                return;
              }
              updateData((current) => ({
                ...current,
                appointments: [...current.appointments, candidate].sort(
                  compareAppointments,
                ),
                treatmentPlans: current.treatmentPlans.map((plan) =>
                  plan.id === candidate.planId
                    ? {
                        ...plan,
                        stages: plan.stages.map((stage) =>
                          stage.id === candidate.stageId
                            ? {
                                ...stage,
                                appointmentId: candidate.id,
                                status: "SCHEDULED",
                                plannedDate: candidate.date,
                              }
                            : stage,
                        ),
                      }
                    : plan,
                ),
              }));
              setAppointmentFormOpen(false);
              setAppointmentForPatientId(null);
              setAppointmentError("");
              showNotice("Appointment added to the local demo schedule.");
            }}
            onStatus={(appointment, next) => {
              if (!canTransitionAppointment(appointment.status, next)) return;
              updateData((current) => ({
                ...current,
                appointments: current.appointments.map((item) =>
                  item.id === appointment.id ? { ...item, status: next } : item,
                ),
                treatmentPlans: current.treatmentPlans.map((plan) => ({
                  ...plan,
                  stages: plan.stages.map((stage) =>
                    stage.id !== appointment.stageId
                      ? stage
                      : {
                          ...stage,
                          status:
                            next === "COMPLETED"
                              ? "COMPLETED"
                              : next === "IN_PROGRESS" || next === "CHECKED_IN"
                                ? "IN_PROGRESS"
                                : next === "CONFIRMED"
                                  ? "SCHEDULED"
                                  : next === "CANCELLED" || next === "NO_SHOW"
                                    ? "PLANNED"
                                    : stage.status,
                        },
                  ),
                })),
              }));
              showNotice(`Appointment marked ${label(next).toLowerCase()}.`);
            }}
            onCancelForm={() => {
              setAppointmentFormOpen(false);
              setAppointmentError("");
            }}
          />
        ) : null}

        {tab === "Patients" ? (
          <Patients
            data={data}
            filteredPatients={filteredPatients}
            formOpen={patientFormOpen}
            onAdd={() => setPatientFormOpen(true)}
            onCreate={(patient) => {
              updateData((current) => ({
                ...current,
                patients: [...current.patients, patient].sort((a, b) =>
                  a.name.localeCompare(b.name),
                ),
              }));
              setSelectedPatientId(patient.id);
              setPatientFormOpen(false);
              showNotice(
                "Fictional patient added to this browser’s demo data.",
              );
            }}
            onSearch={setPatientSearch}
            onSelect={setSelectedPatientId}
            onConsent={(patientId, consent) => {
              updateData((current) => ({
                ...current,
                patients: current.patients.map((patient) =>
                  patient.id === patientId
                    ? {
                        ...patient,
                        consent,
                        consentSource:
                          consent === "GRANTED"
                            ? "Demo consent recorded in clinic"
                            : consent === "OPTED_OUT"
                              ? "Patient request (demo)"
                              : null,
                        consentRecordedAt:
                          consent === "NOT_RECORDED" ? null : today,
                      }
                    : patient,
                ),
              }));
              showNotice("Demo consent status updated.");
            }}
            selectedPatient={selectedPatient}
            onCloseForm={() => setPatientFormOpen(false)}
            onOpenTreatmentPlans={() => {
              if (!selectedPatient) return;
              setCreatePlanForPatientId(selectedPatient.id);
              setPlanFormOpen(true);
              setTab("Treatment plans");
            }}
            onBookAppointment={() => {
              if (!selectedPatient) return;
              setAppointmentForPatientId(selectedPatient.id);
              setAppointmentFormOpen(true);
              setTab("Appointments");
            }}
          />
        ) : null}

        {tab === "Treatment plans" ? (
          <TreatmentPlans
            key={createPlanForPatientId ?? "all"}
            data={data}
            formOpen={planFormOpen}
            initialPatientId={createPlanForPatientId}
            onAdd={() => setPlanFormOpen(true)}
            onCreate={(plan) => {
              updateData((current) => ({
                ...current,
                treatmentPlans: [plan, ...current.treatmentPlans],
              }));
              setPlanFormOpen(false);
              setCreatePlanForPatientId(null);
              showNotice("Treatment plan added to the demo.");
            }}
            onPatient={selectPatient}
            onPlanAcceptance={(planId, acceptance) => {
              updateData((current) => ({
                ...current,
                treatmentPlans: current.treatmentPlans.map((plan) =>
                  plan.id === planId
                    ? {
                        ...plan,
                        acceptance,
                        procedures: plan.procedures.map((procedure) => ({
                          ...procedure,
                          acceptance:
                            acceptance === "ACCEPTED" ||
                            acceptance === "IN_PROGRESS" ||
                            acceptance === "COMPLETED"
                              ? "ACCEPTED"
                              : acceptance === "DECLINED"
                                ? "DECLINED"
                                : acceptance === "DRAFT" ||
                                    acceptance === "PRESENTED" ||
                                    acceptance === "ON_HOLD"
                                  ? "DEFERRED"
                                  : procedure.acceptance,
                        })),
                        acceptanceDate:
                          acceptance === "PRESENTED" || acceptance === "DRAFT"
                            ? null
                            : today,
                      }
                    : plan,
                ),
              }));
              showNotice("Treatment plan decision updated.");
            }}
            onStage={(planId, stageId, status) => {
              updateData((current) => ({
                ...current,
                treatmentPlans: current.treatmentPlans.map((plan) =>
                  plan.id === planId
                    ? {
                        ...plan,
                        stages: plan.stages.map((stage) =>
                          stage.id === stageId ? { ...stage, status } : stage,
                        ),
                      }
                    : plan,
                ),
              }));
              showNotice("Visit stage updated.");
            }}
            onCloseForm={() => setPlanFormOpen(false)}
          />
        ) : null}

        {tab === "Follow-ups" ? (
          <FollowUps
            data={data}
            followUpFormOpen={followUpFormOpen}
            recallFormOpen={recallFormOpen}
            onAddFollowUp={() => setFollowUpFormOpen(true)}
            onAddRecall={() => setRecallFormOpen(true)}
            onCreateFollowUp={(followUp) => {
              updateData((current) => ({
                ...current,
                followUps: [followUp, ...current.followUps],
              }));
              setFollowUpFormOpen(false);
              showNotice("Follow-up added.");
            }}
            onCreateRecall={(recall) => {
              updateData((current) => ({
                ...current,
                recalls: [recall, ...current.recalls],
              }));
              setRecallFormOpen(false);
              showNotice("Preventive recall added.");
            }}
            onFollowUpStatus={(id, status) => {
              updateData((current) => ({
                ...current,
                followUps: current.followUps.map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        status,
                        lastOutcome:
                          status === "COMPLETED"
                            ? "Follow-up completed in demo"
                            : status === "NO_ANSWER"
                              ? "No answer recorded in demo"
                              : status === "CONTACTED"
                                ? "Contact attempt recorded in demo"
                                : item.lastOutcome,
                      }
                    : item,
                ),
              }));
              showNotice("Follow-up status updated.");
            }}
            onRecallStatus={(id, status) => {
              updateData((current) => ({
                ...current,
                recalls: current.recalls.map((item) =>
                  item.id === id ? { ...item, status } : item,
                ),
              }));
              showNotice("Recall status updated.");
            }}
            onRescheduleRecall={(id, dueDate) => {
              updateData((current) => ({
                ...current,
                recalls: current.recalls.map((item) =>
                  item.id === id ? { ...item, dueDate } : item,
                ),
              }));
              showNotice("Recall due date updated.");
            }}
            onPatient={selectPatient}
            onCloseRecall={() => setRecallFormOpen(false)}
            onCloseFollowUp={() => setFollowUpFormOpen(false)}
          />
        ) : null}

        {tab === "Messages" ? (
          <Messages
            data={data}
            messagePatientId={messagePatientId}
            messageTemplateId={messageTemplateId}
            messageText={messageText}
            preparedMessageId={preparedMessageId}
            messageRelatedId={messageRelatedId}
            onPatientChange={(patientId) => {
              setMessagePatientId(patientId);
              setMessageRelatedId("");
              setPreparedMessageId(null);
              setMessageText("");
            }}
            onRelatedChange={(relatedId) => {
              setMessageRelatedId(relatedId);
              const patientId = relatedId.startsWith("appointment:")
                ? data.appointments.find(
                    (item) => `appointment:${item.id}` === relatedId,
                  )?.patientId
                : data.recalls.find((item) => `recall:${item.id}` === relatedId)
                    ?.patientId;
              if (patientId) setMessagePatientId(patientId);
              setPreparedMessageId(null);
              setMessageText("");
            }}
            onTemplateChange={(templateId) => {
              setMessageTemplateId(templateId);
              setPreparedMessageId(null);
              setMessageText("");
            }}
            onMessageChange={(text) => {
              setMessageText(text);
              setPreparedMessageId(null);
            }}
            onPrepare={(message) => {
              updateData((current) => ({
                ...current,
                messages: [message, ...current.messages],
              }));
              setPreparedMessageId(message.id);
              showNotice("Message snapshot prepared and logged locally.");
            }}
            onOpened={(id) => {
              updateData((current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.id === id
                    ? { ...message, status: "OPENED_IN_WHATSAPP" }
                    : message,
                ),
              }));
              showNotice("WhatsApp opened. Delivery is not verified.");
            }}
          />
        ) : null}

        <footer className="py-8 text-center text-xs text-slate-500">
          Fictional data · Local browser storage only · No real clinical advice
          or automated messages
        </footer>
      </div>
    </div>
  );
}

function Overview({
  appointments,
  data,
  followUps,
  onAddAppointment,
  onOpenPatient,
  recallsDue,
  totals,
}: {
  appointments: DemoAppointment[];
  data: DemoData;
  followUps: DemoFollowUp[];
  onAddAppointment: () => void;
  onOpenPatient: (id: string) => void;
  recallsDue: number;
  totals: ReturnType<typeof treatmentValues>;
}) {
  return (
    <main className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Users />}
          label="Patients"
          value={String(data.patients.length)}
          detail="Fictional demo records"
        />
        <Metric
          icon={<CalendarClock />}
          label="Appointments today"
          value={String(appointments.length)}
          detail="Not cancelled or no-show"
        />
        <Metric
          icon={<HeartPulse />}
          label="Follow-ups due"
          value={String(followUps.length)}
          detail="Open follow-up items"
        />
        <Metric
          icon={<ClipboardList />}
          label="Recalls due"
          value={String(recallsDue)}
          detail="Active and due today/overdue"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          action={
            <button
              className="button-primary"
              onClick={onAddAppointment}
              type="button"
            >
              <Plus className="size-4" /> Add appointment
            </button>
          }
          title="Today at a glance"
        >
          {appointments.length === 0 ? (
            <Empty>
              No appointments for today. Add one to try the schedule.
            </Empty>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments
                .slice()
                .sort(compareAppointments)
                .map((appointment) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    key={appointment.id}
                  >
                    <div className="flex items-center gap-3">
                      <span className="min-w-14 rounded-lg bg-teal-50 px-2 py-1.5 text-center text-sm font-semibold text-teal-800">
                        {appointment.time}
                      </span>
                      <div>
                        <p className="font-semibold">
                          {patientName(data, appointment.patientId)}
                        </p>
                        <p className="text-sm text-slate-500">
                          {appointment.type} · {appointment.dentist}
                        </p>
                      </div>
                    </div>
                    <StatusPill value={appointment.status} />
                  </div>
                ))}
            </div>
          )}
        </Panel>
        <Panel title="Financial snapshot">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <Summary
              label="Accepted treatment value"
              value={formatCurrency(totals.accepted)}
            />
            <Summary
              label="Completed treatment value"
              value={formatCurrency(totals.completed)}
            />
            <Summary
              label="Awaiting patient decision"
              value={formatCurrency(totals.deferred)}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            These values summarize fictional accepted procedures, not payments
            or clinic revenue.
          </p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Follow-up priorities">
          {followUps.length === 0 ? (
            <Empty>All demo follow-ups are complete.</Empty>
          ) : (
            <div className="space-y-2">
              {followUps.slice(0, 4).map((item) => {
                const person = data.patients.find(
                  (p) => p.id === item.patientId,
                );
                const priority = prioritizeFollowUp(
                  item,
                  todayKey(),
                  person?.consent ?? "NOT_RECORDED",
                );
                return (
                  <button
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-teal-300 hover:bg-teal-50/40"
                    key={item.id}
                    onClick={() => onOpenPatient(item.patientId)}
                    type="button"
                  >
                    <span>
                      <span className="block font-medium">
                        {person?.name ?? "Unknown patient"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.kind.replaceAll("_", " ")} · due{" "}
                        {formatDate(item.dueDate)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusPill value={priority.priority} />
                      <ChevronRight className="size-4 text-slate-400" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="Recently active patients">
          <div className="space-y-2">
            {data.patients.slice(0, 5).map((patient) => (
              <button
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-teal-300 hover:bg-teal-50/40"
                key={patient.id}
                onClick={() => onOpenPatient(patient.id)}
                type="button"
              >
                <span>
                  <span className="block font-medium">{patient.name}</span>
                  <span className="text-xs text-slate-500">
                    Last visit {formatDate(patient.lastVisit)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <ConsentPill consent={patient.consent} />
                  <ChevronRight className="size-4 text-slate-400" />
                </span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Appointments({
  appointmentDate,
  appointments,
  data,
  error,
  formOpen,
  initialPatientId,
  onAdd,
  onDateChange,
  onPatient,
  onPrepareConfirmation,
  onSave,
  onStatus,
  onCancelForm,
}: {
  appointmentDate: string;
  appointments: DemoAppointment[];
  data: DemoData;
  error: string;
  formOpen: boolean;
  initialPatientId: string | null;
  onAdd: () => void;
  onDateChange: (date: string) => void;
  onPatient: (id: string) => void;
  onPrepareConfirmation: (appointment: DemoAppointment) => void;
  onSave: (appointment: Omit<DemoAppointment, "id" | "status">) => void;
  onStatus: (
    appointment: DemoAppointment,
    status: DemoAppointmentStatus,
  ) => void;
  onCancelForm: () => void;
}) {
  const [patientId, setPatientId] = useState(
    initialPatientId ?? data.patients[0]?.id ?? "",
  );
  const [planId, setPlanId] = useState("");
  const [stageId, setStageId] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [dentist, setDentist] = useState("Dr. Kavya Shah");
  const [chair, setChair] = useState("Chair 1");
  const [type, setType] = useState("Consultation");
  const [notes, setNotes] = useState("");
  const filtered = appointments
    .filter((item) => item.date === appointmentDate)
    .sort(compareAppointments);
  const patientPlans = data.treatmentPlans.filter(
    (plan) => plan.patientId === patientId,
  );
  const linkedPlan = patientPlans.find((plan) => plan.id === planId);

  return (
    <main className="mt-6 space-y-5">
      <SectionHeading
        description="Add appointments and move them through a realistic clinic-day status flow."
        title="Appointments"
      >
        <label className="field-label">
          Schedule date
          <input
            className="field-input"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={appointmentDate}
          />
        </label>
        <button className="button-primary" onClick={onAdd} type="button">
          <Plus className="size-4" /> New appointment
        </button>
      </SectionHeading>
      {formOpen ? (
        <Panel title="New appointment">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave({
                patientId,
                date: appointmentDate,
                time,
                durationMinutes: Number(duration),
                dentist,
                chair,
                type,
                notes,
                planId: planId || null,
                stageId: stageId || null,
              });
            }}
          >
            <label className="field-label">
              Patient
              <select
                className="field-input"
                onChange={(event) => {
                  setPatientId(event.target.value);
                  setPlanId("");
                  setStageId("");
                }}
                value={patientId}
              >
                {data.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Treatment plan (optional)
              <select
                className="field-input"
                onChange={(event) => {
                  setPlanId(event.target.value);
                  setStageId("");
                }}
                value={planId}
              >
                <option value="">No linked plan</option>
                {patientPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Visit stage (optional)
              <select
                className="field-input"
                disabled={!linkedPlan}
                onChange={(event) => setStageId(event.target.value)}
                value={stageId}
              >
                <option value="">No linked stage</option>
                {linkedPlan?.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.sequence}. {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Date
              <input
                className="field-input"
                onChange={(event) => onDateChange(event.target.value)}
                type="date"
                value={appointmentDate}
              />
            </label>
            <label className="field-label">
              Start time
              <input
                className="field-input"
                onChange={(event) => setTime(event.target.value)}
                type="time"
                value={time}
              />
            </label>
            <label className="field-label">
              Duration
              <select
                className="field-input"
                onChange={(event) => setDuration(event.target.value)}
                value={duration}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
              </select>
            </label>
            <label className="field-label">
              Clinician
              <select
                className="field-input"
                onChange={(event) => setDentist(event.target.value)}
                value={dentist}
              >
                <option>Dr. Kavya Shah</option>
                <option>Dr. Arjun Menon</option>
                <option>Dr. Neha Rao</option>
              </select>
            </label>
            <label className="field-label">
              Chair
              <select
                className="field-input"
                onChange={(event) => setChair(event.target.value)}
                value={chair}
              >
                <option>Chair 1</option>
                <option>Chair 2</option>
              </select>
            </label>
            <label className="field-label">
              Visit type
              <input
                className="field-input"
                maxLength={60}
                onChange={(event) => setType(event.target.value)}
                required
                value={type}
              />
            </label>
            <label className="field-label">
              Note (optional)
              <input
                className="field-input"
                maxLength={120}
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </label>
            {error ? (
              <p
                aria-live="assertive"
                className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2 lg:col-span-4"
              >
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button className="button-primary" type="submit">
                Save appointment
              </button>
              <button
                className="button-secondary"
                onClick={onCancelForm}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
      <Panel
        title={`${formatDate(appointmentDate)} · ${filtered.length} appointments`}
      >
        {filtered.length === 0 ? (
          <Empty>
            No visits on this date. Use “New appointment” to add one.
          </Empty>
        ) : (
          <div className="space-y-3">
            {filtered.map((appointment) => (
              <article
                className="rounded-xl border border-slate-200 p-4"
                key={appointment.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    className="text-left"
                    onClick={() => onPatient(appointment.patientId)}
                    type="button"
                  >
                    <span className="block text-lg font-semibold text-slate-900">
                      {appointment.time} ·{" "}
                      {patientName(data, appointment.patientId)}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {appointment.type} · {appointment.durationMinutes} min ·{" "}
                      {appointment.dentist} · {appointment.chair}
                    </span>
                    {appointment.notes ? (
                      <span className="mt-1 block text-xs text-slate-500">
                        {appointment.notes}
                      </span>
                    ) : null}
                  </button>
                  <StatusPill value={appointment.status} />
                </div>
                {appointment.status !== "CANCELLED" &&
                appointment.status !== "NO_SHOW" ? (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <button
                      className="button-secondary text-xs"
                      onClick={() => onPrepareConfirmation(appointment)}
                      type="button"
                    >
                      Prepare WhatsApp confirmation
                    </button>
                  </div>
                ) : null}
                {appointment.status !== "COMPLETED" &&
                appointment.status !== "CANCELLED" &&
                appointment.status !== "NO_SHOW" ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {nextAppointmentStatuses(appointment.status).map((next) => (
                      <button
                        className="button-secondary text-xs"
                        key={next}
                        onClick={() => onStatus(appointment, next)}
                        type="button"
                      >
                        Mark {label(next).toLowerCase()}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </main>
  );
}

function Patients({
  data,
  filteredPatients,
  formOpen,
  onAdd,
  onCreate,
  onSearch,
  onSelect,
  onConsent,
  selectedPatient,
  onCloseForm,
  onOpenTreatmentPlans,
  onBookAppointment,
}: {
  data: DemoData;
  filteredPatients: DemoPatient[];
  formOpen: boolean;
  onAdd: () => void;
  onCreate: (patient: DemoPatient) => void;
  onSearch: (query: string) => void;
  onSelect: (id: string) => void;
  onConsent: (id: string, consent: DemoPatient["consent"]) => void;
  selectedPatient?: DemoPatient;
  onCloseForm: () => void;
  onOpenTreatmentPlans: () => void;
  onBookAppointment: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [consent, setConsent] =
    useState<DemoPatient["consent"]>("NOT_RECORDED");
  const [error, setError] = useState("");
  const plans = selectedPatient
    ? data.treatmentPlans.filter(
        (plan) => plan.patientId === selectedPatient.id,
      )
    : [];
  const visits = selectedPatient
    ? data.appointments
        .filter((item) => item.patientId === selectedPatient.id)
        .sort(compareAppointments)
    : [];
  const recalls = selectedPatient
    ? data.recalls.filter((recall) => recall.patientId === selectedPatient.id)
    : [];
  const followUps = selectedPatient
    ? data.followUps.filter((item) => item.patientId === selectedPatient.id)
    : [];

  return (
    <main className="mt-6 space-y-5">
      <SectionHeading
        description="Select a fictional patient to view their shared visit, plan and recall history."
        title="Patient directory"
      >
        <label className="field-label">
          Search
          <input
            className="field-input"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Name or phone"
            type="search"
          />
        </label>
        <button className="button-primary" onClick={onAdd} type="button">
          <Plus className="size-4" /> Add patient
        </button>
      </SectionHeading>
      {formOpen ? (
        <Panel title="Add fictional patient">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              const digits = phone.replace(/\D/g, "");
              const normalized =
                digits.length === 10
                  ? `+91 ${digits}`
                  : digits.startsWith("91") && digits.length === 12
                    ? `+${digits}`
                    : "";
              if (
                !name.trim() ||
                !normalized ||
                !/^\+91 [6-9]\d{9}$/.test(normalized)
              ) {
                setError(
                  "Enter a patient name and valid Indian mobile number.",
                );
                return;
              }
              if (
                data.patients.some(
                  (patient) =>
                    patient.phone.replace(/\D/g, "") ===
                    normalized.replace(/\D/g, ""),
                )
              ) {
                setError(
                  "That phone number is already in the demo patient list.",
                );
                return;
              }
              onCreate({
                id: newId("pt"),
                name: name.trim(),
                age: Number(age) || 0,
                phone: normalized,
                email: "",
                lastVisit: todayKey(),
                consent,
                consentSource:
                  consent === "GRANTED"
                    ? "Demo consent recorded in clinic"
                    : consent === "OPTED_OUT"
                      ? "Patient request (demo)"
                      : null,
                consentRecordedAt:
                  consent === "NOT_RECORDED" ? null : todayKey(),
                notes: "Fictional patient added during this demo.",
              });
              setName("");
              setPhone("");
              setAge("");
              setError("");
            }}
          >
            <label className="field-label">
              Patient name
              <input
                className="field-input"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="field-label">
              Indian mobile
              <input
                className="field-input"
                inputMode="tel"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98765 43210"
                required
                value={phone}
              />
            </label>
            <label className="field-label">
              Age (optional)
              <input
                className="field-input"
                max="120"
                min="1"
                onChange={(event) => setAge(event.target.value)}
                type="number"
                value={age}
              />
            </label>
            <label className="field-label">
              WhatsApp consent
              <select
                className="field-input"
                onChange={(event) =>
                  setConsent(event.target.value as DemoPatient["consent"])
                }
                value={consent}
              >
                <option value="NOT_RECORDED">Not recorded</option>
                <option value="GRANTED">Granted</option>
                <option value="OPTED_OUT">Opted out</option>
              </select>
            </label>
            {error ? (
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2 lg:col-span-4">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button className="button-primary" type="submit">
                Add patient
              </button>
              <button
                className="button-secondary"
                onClick={onCloseForm}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title={`Patients · ${filteredPatients.length}`}>
          <div className="space-y-2">
            {filteredPatients.map((patient) => (
              <button
                className={`w-full rounded-xl border p-3 text-left ${selectedPatient?.id === patient.id ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}
                key={patient.id}
                onClick={() => onSelect(patient.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{patient.name}</span>
                  <ConsentPill consent={patient.consent} />
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  {patient.phone} · {patient.age || "Age not recorded"}
                </span>
              </button>
            ))}
            {filteredPatients.length === 0 ? (
              <Empty>No patients match your search.</Empty>
            ) : null}
          </div>
        </Panel>
        <Panel
          title={selectedPatient ? selectedPatient.name : "Patient profile"}
        >
          {!selectedPatient ? (
            <Empty>Select a patient to see their profile and history.</Empty>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Phone" value={selectedPatient.phone} />
                <Info
                  label="Last visit"
                  value={formatDate(selectedPatient.lastVisit)}
                />
                <Info
                  label="Email"
                  value={selectedPatient.email || "Not recorded"}
                />
                <Info
                  label="Notes"
                  value={selectedPatient.notes || "No notes"}
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">WhatsApp consent</p>
                    <p className="text-xs text-slate-500">
                      {selectedPatient.consentSource ?? "No consent record"}
                    </p>
                  </div>
                  <select
                    aria-label="Update demo WhatsApp consent"
                    className="field-input w-auto"
                    onChange={(event) =>
                      onConsent(
                        selectedPatient.id,
                        event.target.value as DemoPatient["consent"],
                      )
                    }
                    value={selectedPatient.consent}
                  >
                    <option value="NOT_RECORDED">Not recorded</option>
                    <option value="GRANTED">Granted</option>
                    <option value="OPTED_OUT">Opted out</option>
                  </select>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Demo-only preference. WhatsApp actions require “Granted”.
                </p>
              </div>
              <HistoryGroup title={`Treatment plans · ${plans.length}`}>
                {plans.length ? (
                  plans.map((plan) => (
                    <p key={plan.id}>
                      {plan.name} · {label(plan.acceptance)} ·{" "}
                      {plan.stages.length} visit stages
                    </p>
                  ))
                ) : (
                  <p>No treatment plans.</p>
                )}
              </HistoryGroup>
              <HistoryGroup title={`Appointments · ${visits.length}`}>
                {visits.length ? (
                  visits.map((visit) => (
                    <p key={visit.id}>
                      {formatDate(visit.date)} {visit.time} · {visit.type} ·{" "}
                      {label(visit.status)}
                    </p>
                  ))
                ) : (
                  <p>No appointments.</p>
                )}
              </HistoryGroup>
              <HistoryGroup title={`Recalls · ${recalls.length}`}>
                {recalls.length ? (
                  recalls.map((recall) => (
                    <p key={recall.id}>
                      {recall.type} · due {formatDate(recall.dueDate)} ·{" "}
                      {label(recall.status)}
                    </p>
                  ))
                ) : (
                  <p>No recalls.</p>
                )}
              </HistoryGroup>
              <HistoryGroup title={`Follow-ups · ${followUps.length}`}>
                {followUps.length ? (
                  followUps.map((item) => (
                    <p key={item.id}>
                      {label(item.kind)} · due {formatDate(item.dueDate)} ·{" "}
                      {label(item.status)}
                    </p>
                  ))
                ) : (
                  <p>No follow-ups.</p>
                )}
              </HistoryGroup>
            </div>
          )}
        </Panel>
      </div>
      {selectedPatient ? (
        <DemoClinicalWorkflow
          key={selectedPatient.id}
          onBookAppointment={onBookAppointment}
          onCreatePlan={onOpenTreatmentPlans}
          patient={selectedPatient}
          plans={plans}
        />
      ) : null}
    </main>
  );
}

function TreatmentPlans({
  data,
  formOpen,
  initialPatientId,
  onAdd,
  onCreate,
  onPatient,
  onPlanAcceptance,
  onStage,
  onCloseForm,
}: {
  data: DemoData;
  formOpen: boolean;
  initialPatientId: string | null;
  onAdd: () => void;
  onCreate: (plan: DemoData["treatmentPlans"][number]) => void;
  onPatient: (id: string) => void;
  onPlanAcceptance: (planId: string, acceptance: DemoAcceptance) => void;
  onStage: (planId: string, stageId: string, status: DemoStageStatus) => void;
  onCloseForm: () => void;
}) {
  const [patientId, setPatientId] = useState(
    initialPatientId ?? data.patients[0]?.id ?? "",
  );
  const [name, setName] = useState("");
  const [procedure, setProcedure] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [error, setError] = useState("");

  return (
    <main className="mt-6 space-y-5">
      <SectionHeading
        description="Keep proposed procedures, patient decisions and planned visits connected."
        title="Treatment plans"
      >
        <button className="button-primary" onClick={onAdd} type="button">
          <Plus className="size-4" /> New plan
        </button>
      </SectionHeading>
      {formOpen ? (
        <Panel title="Create a demo treatment plan">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              const parsedAmount = Number(amount);
              if (
                !patientId ||
                !name.trim() ||
                !procedure.trim() ||
                !Number.isFinite(parsedAmount) ||
                parsedAmount <= 0
              ) {
                setError(
                  "Choose a patient and enter the plan, procedure and a positive estimate.",
                );
                return;
              }
              const planId = newId("plan");
              const stageId = newId("stage");
              onCreate({
                id: planId,
                patientId,
                name: name.trim(),
                createdAt: todayKey(),
                clinicalNotes: "Created during local demo.",
                priority: "ROUTINE",
                acceptance: "PRESENTED",
                acceptanceDate: null,
                procedures: [
                  {
                    id: newId("proc"),
                    name: procedure.trim(),
                    treatmentArea: "As discussed",
                    amount: Math.round(parsedAmount),
                    acceptance: "DEFERRED",
                  },
                ],
                stages: [
                  {
                    id: stageId,
                    name: procedure.trim(),
                    description: "First planned visit",
                    sequence: 1,
                    plannedDate: date,
                    status: "PLANNED",
                    appointmentId: null,
                    notes: "",
                  },
                ],
              });
              setName("");
              setProcedure("");
              setAmount("");
              setError("");
            }}
          >
            <label className="field-label">
              Patient
              <select
                className="field-input"
                onChange={(event) => setPatientId(event.target.value)}
                value={patientId}
              >
                {data.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Plan name
              <input
                className="field-input"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="field-label">
              Procedure
              <input
                className="field-input"
                maxLength={80}
                onChange={(event) => setProcedure(event.target.value)}
                required
                value={procedure}
              />
            </label>
            <label className="field-label">
              Estimate (INR)
              <input
                className="field-input"
                min="1"
                onChange={(event) => setAmount(event.target.value)}
                required
                type="number"
                value={amount}
              />
            </label>
            <label className="field-label">
              First planned visit
              <input
                className="field-input"
                onChange={(event) => setDate(event.target.value)}
                required
                type="date"
                value={date}
              />
            </label>
            {error ? (
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2 lg:col-span-5">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
              <button className="button-primary" type="submit">
                Create plan
              </button>
              <button
                className="button-secondary"
                onClick={onCloseForm}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
      <div className="space-y-4">
        {data.treatmentPlans.map((plan) => (
          <Panel
            key={plan.id}
            title={plan.name}
            action={<StatusPill value={plan.acceptance} />}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                className="text-left text-sm font-medium text-teal-800 hover:underline"
                onClick={() => onPatient(plan.patientId)}
                type="button"
              >
                {patientName(data, plan.patientId)} · View profile
              </button>
              <p className="text-sm font-semibold">
                {formatCurrency(
                  plan.procedures.reduce((sum, item) => sum + item.amount, 0),
                )}{" "}
                proposed
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <label className="field-label min-w-52">
                Patient decision
                <select
                  className="field-input"
                  onChange={(event) =>
                    onPlanAcceptance(
                      plan.id,
                      event.target.value as DemoAcceptance,
                    )
                  }
                  value={plan.acceptance}
                >
                  {(
                    [
                      "DRAFT",
                      "PRESENTED",
                      "ACCEPTED",
                      "PARTIALLY_ACCEPTED",
                      "DECLINED",
                      "ON_HOLD",
                      "IN_PROGRESS",
                      "COMPLETED",
                    ] as const
                  ).map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-sm font-semibold">Visit stages</h3>
              {plan.stages.map((stage) => (
                <div
                  className="grid gap-2 border-b border-slate-100 py-2 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  key={stage.id}
                >
                  <div>
                    <p className="font-medium">
                      {stage.sequence}. {stage.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(stage.plannedDate)} · {stage.description}
                    </p>
                  </div>
                  <StatusPill value={stage.status} />
                  <select
                    aria-label={`Update ${stage.name} status`}
                    className="field-input w-auto"
                    onChange={(event) =>
                      onStage(
                        plan.id,
                        stage.id,
                        event.target.value as DemoStageStatus,
                      )
                    }
                    value={stage.status}
                  >
                    {(
                      [
                        "PLANNED",
                        "SCHEDULED",
                        "IN_PROGRESS",
                        "COMPLETED",
                        "SKIPPED",
                      ] as const
                    ).map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </main>
  );
}

function FollowUps({
  data,
  followUpFormOpen,
  recallFormOpen,
  onAddFollowUp,
  onAddRecall,
  onCreateFollowUp,
  onCreateRecall,
  onFollowUpStatus,
  onRecallStatus,
  onRescheduleRecall,
  onPatient,
  onCloseRecall,
  onCloseFollowUp,
}: {
  data: DemoData;
  followUpFormOpen: boolean;
  recallFormOpen: boolean;
  onAddFollowUp: () => void;
  onAddRecall: () => void;
  onCreateFollowUp: (followUp: DemoFollowUp) => void;
  onCreateRecall: (recall: DemoRecall) => void;
  onFollowUpStatus: (id: string, status: DemoFollowUp["status"]) => void;
  onRecallStatus: (id: string, status: DemoRecall["status"]) => void;
  onRescheduleRecall: (id: string, dueDate: string) => void;
  onPatient: (id: string) => void;
  onCloseRecall: () => void;
  onCloseFollowUp: () => void;
}) {
  const [patientId, setPatientId] = useState(data.patients[0]?.id ?? "");
  const [kind, setKind] = useState<DemoFollowUp["kind"]>("TREATMENT");
  const [dueDate, setDueDate] = useState(todayKey());
  const [followError, setFollowError] = useState("");
  const [recallPatientId, setRecallPatientId] = useState(
    data.patients[0]?.id ?? "",
  );
  const [recallType, setRecallType] = useState("Six-month checkup");
  const [lastVisit, setLastVisit] = useState(todayKey());
  const [interval, setInterval] = useState("6");
  const [recallError, setRecallError] = useState("");

  return (
    <main className="mt-6 space-y-5">
      <SectionHeading
        description="Track care continuity and preventive recall work without sending anything automatically."
        title="Follow-ups & recalls"
      >
        <button
          className="button-secondary"
          onClick={onAddRecall}
          type="button"
        >
          <Plus className="size-4" /> Add recall
        </button>
        <button
          className="button-primary"
          onClick={onAddFollowUp}
          type="button"
        >
          <Plus className="size-4" /> Add follow-up
        </button>
      </SectionHeading>
      {followUpFormOpen ? (
        <Panel title="Add follow-up">
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!patientId || !validDate(dueDate)) {
                setFollowError("Choose a patient and a valid due date.");
                return;
              }
              onCreateFollowUp({
                id: newId("fu"),
                patientId,
                planId: null,
                appointmentId: null,
                kind,
                dueDate,
                status: "PENDING",
                lastOutcome: "New demo follow-up",
                notes: "",
              });
            }}
          >
            <label className="field-label">
              Patient
              <select
                className="field-input"
                onChange={(event) => setPatientId(event.target.value)}
                value={patientId}
              >
                {data.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Reason
              <select
                className="field-input"
                onChange={(event) =>
                  setKind(event.target.value as DemoFollowUp["kind"])
                }
                value={kind}
              >
                <option value="TREATMENT">Treatment decision</option>
                <option value="MISSED_APPOINTMENT">Missed appointment</option>
                <option value="RECALL">Preventive recall</option>
                <option value="RESPONSE">Response check</option>
              </select>
            </label>
            <label className="field-label">
              Due date
              <input
                className="field-input"
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </label>
            {followError ? (
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-4">
                {followError}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-4">
              <button className="button-primary" type="submit">
                Save follow-up
              </button>
              <button
                className="button-secondary"
                onClick={onCloseFollowUp}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
      {recallFormOpen ? (
        <Panel title="Add preventive recall">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const months = Number(interval);
                const calculatedDate = updateRecallDueDate(lastVisit, months);
                if (!recallPatientId || !recallType.trim())
                  throw new Error("Choose a patient and recall type.");
                onCreateRecall({
                  id: newId("rec"),
                  patientId: recallPatientId,
                  type: recallType.trim(),
                  lastVisit,
                  intervalMonths: months,
                  dueDate: calculatedDate,
                  status: "ACTIVE",
                  dentistConfirmed: false,
                });
              } catch (error) {
                setRecallError(
                  error instanceof Error
                    ? error.message
                    : "Could not calculate recall date.",
                );
              }
            }}
          >
            <label className="field-label">
              Patient
              <select
                className="field-input"
                onChange={(event) => setRecallPatientId(event.target.value)}
                value={recallPatientId}
              >
                {data.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Recall type
              <input
                className="field-input"
                maxLength={60}
                onChange={(event) => setRecallType(event.target.value)}
                required
                value={recallType}
              />
            </label>
            <label className="field-label">
              Last visit
              <input
                className="field-input"
                onChange={(event) => setLastVisit(event.target.value)}
                type="date"
                value={lastVisit}
              />
            </label>
            <label className="field-label">
              Interval (months)
              <input
                className="field-input"
                max="60"
                min="1"
                onChange={(event) => setInterval(event.target.value)}
                type="number"
                value={interval}
              />
            </label>
            <p className="self-end pb-2 text-sm text-slate-600">
              Due: {recallDuePreview(lastVisit, interval)}
            </p>
            {recallError ? (
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2 lg:col-span-5">
                {recallError}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
              <button className="button-primary" type="submit">
                Save recall
              </button>
              <button
                className="button-secondary"
                onClick={onCloseRecall}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title={`Follow-up queue · ${data.followUps.filter((item) => item.status !== "COMPLETED").length} open`}
        >
          <div className="space-y-3">
            {data.followUps
              .filter((item) => item.status !== "COMPLETED")
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((item) => {
                const person = data.patients.find(
                  (patient) => patient.id === item.patientId,
                );
                const priority = prioritizeFollowUp(
                  item,
                  todayKey(),
                  person?.consent ?? "NOT_RECORDED",
                );
                return (
                  <article
                    className="rounded-xl border border-slate-200 p-3"
                    key={item.id}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <button
                        className="font-semibold hover:text-teal-800"
                        onClick={() => onPatient(item.patientId)}
                        type="button"
                      >
                        {person?.name}
                      </button>
                      <StatusPill value={priority.priority} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {label(item.kind)} · due {formatDate(item.dueDate)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {priority.explanation} {item.lastOutcome}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["CONTACTED", "NO_ANSWER", "COMPLETED"] as const).map(
                        (status) => (
                          <button
                            className="button-secondary text-xs"
                            key={status}
                            onClick={() => onFollowUpStatus(item.id, status)}
                            type="button"
                          >
                            Mark {label(status).toLowerCase()}
                          </button>
                        ),
                      )}
                    </div>
                  </article>
                );
              })}
            {data.followUps.every((item) => item.status === "COMPLETED") ? (
              <Empty>No open follow-ups.</Empty>
            ) : null}
          </div>
        </Panel>
        <Panel title="Preventive recalls">
          <div className="space-y-3">
            {data.recalls.map((recall) => (
              <RecallRow
                data={data}
                key={recall.id}
                onPatient={onPatient}
                onReschedule={onRescheduleRecall}
                onStatus={onRecallStatus}
                recall={recall}
              />
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function RecallRow({
  data,
  recall,
  onPatient,
  onReschedule,
  onStatus,
}: {
  data: DemoData;
  recall: DemoRecall;
  onPatient: (id: string) => void;
  onReschedule: (id: string, dueDate: string) => void;
  onStatus: (id: string, status: DemoRecall["status"]) => void;
}) {
  const [newDate, setNewDate] = useState(recall.dueDate);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const overdue = recall.status === "ACTIVE" && recall.dueDate < todayKey();
  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          className="font-semibold hover:text-teal-800"
          onClick={() => onPatient(recall.patientId)}
          type="button"
        >
          {patientName(data, recall.patientId)}
        </button>
        <StatusPill value={overdue ? "OVERDUE" : recall.status} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {recall.type} · due {formatDate(recall.dueDate)}
      </p>
      <p className="text-xs text-slate-500">
        Every {recall.intervalMonths} months · last visit{" "}
        {formatDate(recall.lastVisit)}
      </p>
      {recall.status === "ACTIVE" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="button-secondary text-xs"
            onClick={() => onStatus(recall.id, "COMPLETED")}
            type="button"
          >
            Mark completed
          </button>
          <button
            className="button-secondary text-xs"
            onClick={() => setShowReschedule(!showReschedule)}
            type="button"
          >
            Reschedule
          </button>
          <button
            className="button-secondary text-xs"
            onClick={() => onStatus(recall.id, "PAUSED")}
            type="button"
          >
            Pause
          </button>
        </div>
      ) : null}
      {showReschedule ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validDate(newDate) || newDate <= recall.dueDate) {
              setRescheduleError(
                "Choose a valid date later than the current due date.",
              );
              return;
            }
            onReschedule(recall.id, newDate);
            setRescheduleError("");
            setShowReschedule(false);
          }}
        >
          <label className="field-label">
            New due date
            <input
              className="field-input"
              onChange={(event) => setNewDate(event.target.value)}
              type="date"
              value={newDate}
            />
          </label>
          <button className="button-primary text-xs" type="submit">
            Save date
          </button>
          {rescheduleError ? (
            <p
              aria-live="assertive"
              className="basis-full text-xs text-rose-700"
            >
              {rescheduleError}
            </p>
          ) : null}
        </form>
      ) : null}
    </article>
  );
}

function Messages({
  data,
  messagePatientId,
  messageTemplateId,
  messageText,
  preparedMessageId,
  messageRelatedId,
  onPatientChange,
  onRelatedChange,
  onTemplateChange,
  onMessageChange,
  onPrepare,
  onOpened,
}: {
  data: DemoData;
  messagePatientId: string;
  messageTemplateId: string;
  messageText: string;
  preparedMessageId: string | null;
  messageRelatedId: string;
  onPatientChange: (id: string) => void;
  onRelatedChange: (id: string) => void;
  onTemplateChange: (id: string) => void;
  onMessageChange: (message: string) => void;
  onPrepare: (message: DemoData["messages"][number]) => void;
  onOpened: (id: string) => void;
}) {
  const patient = data.patients.find((item) => item.id === messagePatientId);
  const template = data.templates.find((item) => item.id === messageTemplateId);
  const prepared = data.messages.find((item) => item.id === preparedMessageId);
  const appointment = messageRelatedId.startsWith("appointment:")
    ? data.appointments.find(
        (item) => `appointment:${item.id}` === messageRelatedId,
      )
    : undefined;
  const recall = messageRelatedId.startsWith("recall:")
    ? data.recalls.find((item) => `recall:${item.id}` === messageRelatedId)
    : undefined;
  const patientAppointments = data.appointments.filter(
    (item) =>
      item.patientId === messagePatientId &&
      !["CANCELLED", "NO_SHOW"].includes(item.status),
  );
  const patientRecalls = data.recalls.filter(
    (item) => item.patientId === messagePatientId && item.status === "ACTIVE",
  );
  const values = useMemo(
    () => ({
      patient_name: patient?.name ?? "",
      clinic_name: clinicName,
      treatment_name: "your care plan",
      visit_number: "1",
      total_visits: "2",
      due_date: formatDate(recall?.dueDate ?? appointment?.date ?? todayKey()),
      clinic_phone: clinicPhone,
      appointment_date: formatDate(appointment?.date ?? todayKey()),
      appointment_time: appointment?.time ?? "to be arranged",
      clinician_name: appointment?.dentist ?? "your clinician",
    }),
    [appointment, patient, recall],
  );
  const preview = template ? renderDemoMessage(template, values) : "";
  const consent = patient ? canPrepareWhatsApp(patient.consent) : false;
  const completePreview =
    preview.trim().length > 0 &&
    !/\{\{[^{}]*\}\}/.test(preview) &&
    !/\b(undefined|null)\b/i.test(preview);
  const whatsappUrl =
    prepared && patient && consent && prepared.snapshot.trim()
      ? createWhatsAppUrl(patient.phone, prepared.snapshot, patient.consent)
      : "";

  return (
    <main className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <Panel title="Prepare a reminder">
        <p className="mb-4 text-sm text-slate-600">
          Choose a fictional patient and template. Preparing only records a
          local snapshot. The WhatsApp link opens only after you press the
          button.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field-label">
            Patient
            <select
              className="field-input"
              onChange={(event) => onPatientChange(event.target.value)}
              value={messagePatientId}
            >
              <option value="">Choose patient</option>
              {data.patients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Template
            <select
              className="field-input"
              onChange={(event) => onTemplateChange(event.target.value)}
              value={messageTemplateId}
            >
              <option value="">Choose template</option>
              {data.templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-label mt-3">
          Appointment or recall
          <select
            className="field-input"
            disabled={!patient}
            onChange={(event) => onRelatedChange(event.target.value)}
            value={messageRelatedId}
          >
            <option value="">General reminder (no scheduled time)</option>
            <optgroup label="Appointments">
              {patientAppointments.map((item) => (
                <option key={item.id} value={`appointment:${item.id}`}>
                  {formatDate(item.date)} · {item.time} · {item.type}
                </option>
              ))}
            </optgroup>
            <optgroup label="Recalls">
              {patientRecalls.map((item) => (
                <option key={item.id} value={`recall:${item.id}`}>
                  {item.type} · due {formatDate(item.dueDate)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {patient ? (
          <div
            className={`mt-3 rounded-xl border p-3 text-sm ${consent ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
          >
            <p className="font-semibold">
              WhatsApp consent: {label(patient.consent)}
            </p>
            <p className="mt-1 text-xs">
              {consent
                ? "Consent is recorded in this fictional demo."
                : "WhatsApp preparation is disabled until consent is recorded as granted on the patient profile."}
            </p>
          </div>
        ) : null}
        <label className="field-label mt-4">
          Message preview
          <textarea
            className="field-input min-h-32 resize-y"
            disabled={!patient || !template || !consent}
            maxLength={1000}
            onChange={(event) => onMessageChange(event.target.value)}
            value={messageText || preview}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="button-primary"
            disabled={
              !patient ||
              !template ||
              !consent ||
              !(messageText || preview).trim() ||
              (!messageText.trim() && !completePreview)
            }
            onClick={() => {
              if (!patient || !template || !consent) return;
              onPrepare({
                id: newId("msg"),
                patientId: patient.id,
                templateName: template.name,
                snapshot: (messageText || preview).trim(),
                status: "PREPARED",
                createdAt: new Date().toISOString(),
              });
            }}
            type="button"
          >
            <Check className="size-4" /> Save prepared snapshot
          </button>
          {prepared && consent && whatsappUrl ? (
            <a
              className="button-secondary"
              href={whatsappUrl}
              onClick={() => onOpened(prepared.id)}
              rel="noreferrer"
              target="_blank"
            >
              Open WhatsApp <ArrowUpRight className="size-4" />
            </a>
          ) : null}
        </div>
        {template && !completePreview && !messageText.trim() ? (
          <p className="mt-2 text-sm text-rose-700" role="alert">
            This message is incomplete. Choose a valid appointment or recall,
            then review the preview before preparing it.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
          Opening the chat does not confirm that the message was sent or
          delivered.
        </p>
      </Panel>
      <Panel title="Message activity">
        {data.messages.length ? (
          <div className="space-y-3">
            {data.messages.map((message) => (
              <article
                className="rounded-xl border border-slate-200 p-3"
                key={message.id}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">
                    {patientName(data, message.patientId)}
                  </p>
                  <StatusPill value={message.status} />
                </div>
                <p className="text-xs text-slate-500">
                  {message.templateName} ·{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(message.createdAt))}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {message.snapshot}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <Empty>No prepared message records in this browser yet.</Empty>
        )}
      </Panel>
    </main>
  );
}

function SectionHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600">{description}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({
  icon,
  label: metricLabel,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wide">
          {metricLabel}
        </span>
        <span className="text-teal-700">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Summary({
  label: summaryLabel,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{summaryLabel}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const color =
    value === "COMPLETED" ||
    value === "ACCEPTED" ||
    value === "GRANTED" ||
    value === "Low"
      ? "bg-emerald-50 text-emerald-800"
      : value === "OVERDUE" ||
          value === "NO_SHOW" ||
          value === "DECLINED" ||
          value === "High"
        ? "bg-rose-50 text-rose-800"
        : value === "PAUSED" || value === "CANCELLED" || value === "OPTED_OUT"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-800";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}
    >
      {label(value)}
    </span>
  );
}

function ConsentPill({ consent }: { consent: DemoPatient["consent"] }) {
  return <StatusPill value={consent} />;
}

function Info({ label: infoLabel, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {infoLabel}
      </p>
      <p className="mt-1 break-words text-sm text-slate-800">{value}</p>
    </div>
  );
}

function HistoryGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <div className="space-y-1 text-sm text-slate-600">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function patientName(data: DemoData, patientId: string) {
  return (
    data.patients.find((patient) => patient.id === patientId)?.name ??
    "Unknown patient"
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  if (!validDate(value)) return "Invalid date";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function recallDuePreview(lastVisit: string, interval: string) {
  try {
    return formatDate(updateRecallDueDate(lastVisit, Number(interval)));
  } catch {
    return "Choose a valid date and interval";
  }
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function compareAppointments(a: DemoAppointment, b: DemoAppointment) {
  return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
}

function nextAppointmentStatuses(status: DemoAppointmentStatus) {
  const possible: DemoAppointmentStatus[] = [
    "CONFIRMED",
    "CHECKED_IN",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
  ];
  return possible.filter((next) => canTransitionAppointment(status, next));
}

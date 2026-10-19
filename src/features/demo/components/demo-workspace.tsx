"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, MessageSquareText, RefreshCw, ShieldAlert, Stethoscope, Users } from "lucide-react";

import { DemoProvider, useDemoData } from "@/features/demo/components/demo-provider";
import {
  canPrepareWhatsApp,
  createWhatsAppUrl,
  pendingRecallCount,
  prioritizeFollowUp,
  renderDemoMessage,
  treatmentValues,
} from "@/features/demo/lib/demo-rules";

const clinicName = "Sunrise Dental Studio";
const clinicPhone = "+91 98765 43210";

export function DemoWorkspace() {
  return (
    <DemoProvider>
      <DemoWorkspaceInner />
    </DemoProvider>
  );
}

function DemoWorkspaceInner() {
  const { data, ready, storageWarning, reset } = useDemoData();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Loading demo workspace…
      </div>
    );
  }

  const totals = treatmentValues(data.treatmentPlans);
  const openRecallCount = pendingRecallCount(data.recalls, todayKey());
  const dueToday = data.appointments.filter((appointment) => appointment.date === todayKey()).length;
  const followUps = data.followUps.map((entry) => {
    const patient = data.patients.find((item) => item.id === entry.patientId);
    return {
      ...entry,
      patientName: patient?.name ?? "Unknown patient",
      consent: patient?.consent ?? "NOT_RECORDED",
      priority: prioritizeFollowUp(entry, todayKey(), patient?.consent ?? "NOT_RECORDED"),
    };
  });
  const template = data.templates[0];
  const firstPatient = data.patients[0];
  const messagePreview = renderDemoMessage(template, {
    patient_name: firstPatient?.name ?? "Patient",
    clinic_name: clinicName,
    treatment_name: "root canal consultation",
    visit_number: "2",
    total_visits: "3",
    due_date: todayKey(),
    clinic_phone: clinicPhone,
  });
  const waLink = createWhatsAppUrl(firstPatient.phone, messagePreview, firstPatient.consent);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-900 via-teal-800 to-sky-900 p-6 shadow-sm text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">
                Demo mode
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">DentalFlow local demo</h1>
              <p className="mt-2 max-w-2xl text-sm text-teal-50/90">
                Fictional clinic data for local demonstrations only. No live patient records, no external messaging, and no database writes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15">
                Exit to app
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50"
              >
                <RefreshCw className="size-4" /> Reset demo
              </button>
            </div>
          </div>
        </header>

        {storageWarning ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>{storageWarning}</p>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<Users className="size-5" />} label="Active patients" value={String(data.patients.length)} detail="Demo sample list" />
          <MetricCard icon={<CalendarClock className="size-5" />} label="Due today" value={String(dueToday)} detail="Appointments and recalls" />
          <MetricCard icon={<Stethoscope className="size-5" />} label="Treatment value" value={formatCurrency(totals.accepted)} detail="Accepted procedures" />
          <MetricCard icon={<MessageSquareText className="size-5" />} label="Recall follow-ups" value={String(openRecallCount)} detail="Reports due or overdue" />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Patients</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {data.patients.length} records
              </span>
            </div>

            <div className="space-y-3">
              {data.patients.slice(0, 6).map((patient) => (
                <div key={patient.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{patient.name}</p>
                    <p className="text-sm text-slate-500">{patient.phone} · {patient.age} years</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-teal-50 px-2 py-1 font-medium text-teal-800">{patient.consent}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">Last visit {patient.lastVisit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">WhatsApp preview</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${canPrepareWhatsApp(firstPatient.consent) ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {canPrepareWhatsApp(firstPatient.consent) ? "Consent on file" : "Consent pending"}
              </span>
            </div>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {messagePreview}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Open WhatsApp to send
                <ArrowUpRight className="size-4" />
              </a>
              <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                Template: {template.name}
              </span>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Appointments</h2>
            <div className="space-y-3">
              {data.appointments.slice(0, 5).map((appointment) => (
                <div key={appointment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{patientName(data, appointment.patientId)}</p>
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-700">
                      {appointment.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{appointment.date} · {appointment.time} · {appointment.type}</p>
                  <p className="text-sm text-slate-500">{appointment.dentist} · {appointment.chair}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Follow-up queue</h2>
            <div className="space-y-3">
              {followUps.slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{entry.patientName}</p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${entry.priority.priority === "High" ? "bg-rose-100 text-rose-700" : entry.priority.priority === "Medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {entry.priority.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{entry.kind} · due {entry.dueDate}</p>
                  <p className="text-xs text-slate-500">{entry.priority.explanation}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Treatment plans</h2>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">
              {data.treatmentPlans.length} active plans
            </span>
          </div>

          <div className="space-y-3">
            {data.treatmentPlans.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{plan.name}</p>
                    <p className="text-sm text-slate-500">{patientName(data, plan.patientId)} · {plan.acceptance}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-1">Proposed {formatCurrency(plan.procedures.reduce((sum, item) => sum + item.amount, 0))}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Accepted {plan.procedures.filter((item) => item.acceptance === "ACCEPTED").length}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Clinic snapshot</h2>
            <CheckCircle2 className="size-5 text-emerald-600" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SummaryTile label="Treatment value" value={formatCurrency(totals.accepted)} description="Accepted procedures" />
            <SummaryTile label="Deferred value" value={formatCurrency(totals.deferred)} description="Awaiting decision" />
            <SummaryTile label="Open recalls" value={String(openRecallCount)} description="Due or late" />
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-slate-500">
        <span className="text-xs font-medium uppercase tracking-[0.12em]">{label}</span>
        <span className="text-teal-700">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function SummaryTile({ label, value, description }: { label: string; value: string; description: string; }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function patientName(data: ReturnType<typeof useDemoData>["data"], patientId: string) {
  return data.patients.find((patient) => patient.id === patientId)?.name ?? "Unknown patient";
}

function todayKey() {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const map = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

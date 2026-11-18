import { notFound } from "next/navigation";
import { ClinicRole, PatientLeadSource, PatientLeadStatus } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { convertPatientLeadToPatient, createPatientLead, updatePatientLead } from "@/features/leads/actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const sourceLabels: Record<PatientLeadSource, string> = {
  WALK_IN: "Walk-in",
  PHONE_CALL: "Phone call",
  WEBSITE: "Website",
  REFERRAL: "Referral",
  SOCIAL_MEDIA: "Social media",
  OTHER: "Other",
};
const statusLabels: Record<PatientLeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  APPOINTMENT_BOOKED: "Appointment booked",
  CONVERTED: "Converted to patient",
  LOST: "Not proceeding",
};
const statusStyles: Record<PatientLeadStatus, string> = {
  NEW: "bg-sky-50 text-sky-800",
  CONTACTED: "bg-amber-50 text-amber-800",
  APPOINTMENT_BOOKED: "bg-emerald-50 text-emerald-800",
  CONVERTED: "bg-teal-100 text-teal-900",
  LOST: "bg-slate-100 text-slate-600",
};
const messages: Record<string, string> = {
  created: "Lead added to your clinic CRM.",
  updated: "Lead follow-up details updated.",
  converted: "Lead converted to a patient record.",
  "already-converted": "This enquiry has already been converted.",
  "lead-not-convertible": "Mark this enquiry as active before converting it.",
  "archived-patient-conflict": "A patient with this phone number is archived. Restore or review that record before converting this enquiry.",
  "conversion-error": "We could not convert this enquiry. Check patient capacity and try again.",
  "duplicate-phone": "A lead with this phone number already exists in this clinic.",
  "invalid-phone": "Enter a valid Indian mobile number.",
  "lead-not-found": "This lead could not be found in this clinic.",
  error: "We could not save the lead. Please try again.",
};
const editableLeadStatuses = [PatientLeadStatus.NEW, PatientLeadStatus.CONTACTED, PatientLeadStatus.APPOINTMENT_BOOKED, PatientLeadStatus.LOST];
const inrDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
function dateInputValue(value: Date | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export default async function PatientLeadsPage({
  params,
  searchParams,
}: { params: { clinicId: string }; searchParams?: { status?: string } }) {
  const parsed = z.string().uuid().safeParse(params.clinicId);
  if (!parsed.success) notFound();
  const membership = await requireClinicRole(parsed.data, [ClinicRole.OWNER]);
  const selectedStatus = Object.values(PatientLeadStatus).includes(searchParams?.status as PatientLeadStatus)
    ? (searchParams?.status as PatientLeadStatus)
    : undefined;
  const [clinic, leads, counts, dueCount] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: membership.clinicId }, select: { name: true } }),
    prisma.patientLead.findMany({
      where: { clinicId: membership.clinicId, ...(selectedStatus ? { status: selectedStatus } : {}) },
      orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.patientLead.groupBy({
      by: ["status"],
      where: { clinicId: membership.clinicId },
      _count: { _all: true },
    }),
    prisma.patientLead.count({
      where: { clinicId: membership.clinicId, nextFollowUpAt: { lte: new Date() }, status: { notIn: [PatientLeadStatus.LOST, PatientLeadStatus.APPOINTMENT_BOOKED] } },
    }),
  ]);
  if (!clinic) notFound();
  const now = new Date();
  const totalCount = counts.reduce((total, entry) => total + entry._count._all, 0);
  const countFor = (status: PatientLeadStatus) => counts.find((entry) => entry.status === status)?._count._all ?? 0;
  const statusMessage = searchParams?.status ? messages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="leads" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Patient enquiries & follow-ups</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Track new enquiries, treatment interests and the next follow-up without mixing prospects into clinical patient records.</p>
          </div>
          <a href={`/clinic/${membership.clinicId}/patients`} className="text-sm font-semibold text-teal-700 hover:underline">View patient records →</a>
        </header>

        {statusMessage ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{statusMessage}</p> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <a href={`/clinic/${membership.clinicId}/leads`} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">All enquiries</p><p className="mt-2 text-2xl font-semibold text-slate-900">{totalCount}</p></a>
          <a href={`/clinic/${membership.clinicId}/leads?status=NEW`} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">New</p><p className="mt-2 text-2xl font-semibold text-slate-900">{countFor(PatientLeadStatus.NEW)}</p></a>
          <a href={`/clinic/${membership.clinicId}/leads?status=CONTACTED`} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Contacted</p><p className="mt-2 text-2xl font-semibold text-slate-900">{countFor(PatientLeadStatus.CONTACTED)}</p></a>
          <a href={`/clinic/${membership.clinicId}/leads?status=APPOINTMENT_BOOKED`} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Appointment booked</p><p className="mt-2 text-2xl font-semibold text-slate-900">{countFor(PatientLeadStatus.APPOINTMENT_BOOKED)}</p></a>
          <a href={`/clinic/${membership.clinicId}/leads?status=CONVERTED`} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Converted</p><p className="mt-2 text-2xl font-semibold text-slate-900">{countFor(PatientLeadStatus.CONVERTED)}</p></a>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-medium text-amber-800">Follow-ups due</p><p className="mt-2 text-2xl font-semibold text-amber-950">{dueCount}</p></div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Add patient enquiry</h2>
          <p className="mt-1 text-sm text-slate-500">Capture the enquiry first; create a clinical patient record when the person actually registers.</p>
          <form action={createPatientLead} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="clinicId" value={membership.clinicId} />
            <label className="text-sm text-slate-700">Full name<input required name="fullName" minLength={2} maxLength={160} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
            <label className="text-sm text-slate-700">Mobile number<input required name="phoneNumber" type="tel" maxLength={20} placeholder="+91 98765 43210" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
            <label className="text-sm text-slate-700">Email (optional)<input name="email" type="email" maxLength={254} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
            <label className="text-sm text-slate-700">Enquiry source<select name="source" defaultValue="OTHER" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3">{Object.values(PatientLeadSource).map((source) => <option key={source} value={source}>{sourceLabels[source]}</option>)}</select></label>
            <label className="text-sm text-slate-700">Treatment interest<input name="treatmentInterest" maxLength={160} placeholder="e.g. braces, cleaning, implant" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
            <label className="text-sm text-slate-700">Next follow-up date<input name="nextFollowUpAt" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
            <label className="text-sm text-slate-700 sm:col-span-2 lg:col-span-3">Notes<textarea name="notes" rows={2} maxLength={5000} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Enquiry details, preferred time, questions..." /></label>
            <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2 lg:col-span-3"><input name="whatsappOptIn" type="checkbox" className="mt-1" /><span>Patient explicitly agreed to WhatsApp contact. This only enables a manual chat link; DentalFlow will not send messages automatically.</span></label>
            <button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 lg:col-span-3">Save enquiry</button>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h2 className="font-semibold text-slate-900">Enquiry pipeline</h2><p className="mt-1 text-sm text-slate-500">Showing up to 100 enquiries, with the earliest follow-up dates first.</p></div>
            <div className="flex flex-wrap gap-2 text-xs">
              <a href={`/clinic/${membership.clinicId}/leads`} className="rounded-full border border-slate-200 px-3 py-1.5 font-medium text-slate-600">All</a>
              {Object.values(PatientLeadStatus).map((status) => <a key={status} href={`/clinic/${membership.clinicId}/leads?status=${status}`} className={`rounded-full border px-3 py-1.5 font-medium ${selectedStatus === status ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}>{statusLabels[status]}</a>)}
            </div>
          </div>
          {leads.length ? <div className="divide-y divide-slate-100">
            {leads.map((lead) => {
              const overdue = lead.nextFollowUpAt && lead.nextFollowUpAt < now && lead.status !== PatientLeadStatus.LOST && lead.status !== PatientLeadStatus.APPOINTMENT_BOOKED;
              const whatsappNumber = lead.normalizedPhone.replace(/\D/g, "");
              return (
                <article key={lead.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{lead.fullName}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[lead.status]}`}>{statusLabels[lead.status]}</span>{overdue ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">Follow-up overdue</span> : null}</div>
                      <p className="mt-1 text-sm text-slate-600">{lead.phoneNumber}{lead.email ? ` · ${lead.email}` : ""}</p>
                      <p className="mt-1 text-xs text-slate-500">{sourceLabels[lead.source]}{lead.treatmentInterest ? ` · Interested in ${lead.treatmentInterest}` : ""}{lead.lastContactedAt ? ` · Last contacted ${inrDate.format(lead.lastContactedAt)}` : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`tel:${lead.phoneNumber}`} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Call</a>
                      {lead.whatsappOptIn && lead.whatsappOptedInAt ? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="rounded-md border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">Open WhatsApp</a> : <span className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500">No WhatsApp consent</span>}
                    </div>
                  </div>
                  {lead.nextFollowUpAt ? <p className={`text-xs font-medium ${overdue ? "text-rose-700" : "text-slate-500"}`}>Next follow-up: {inrDate.format(lead.nextFollowUpAt)}</p> : <p className="text-xs text-slate-500">No follow-up date set</p>}
                  {lead.notes ? <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{lead.notes}</p> : null}
                  {!lead.convertedPatientId ? (
                  <form action={updatePatientLead} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input type="hidden" name="clinicId" value={membership.clinicId} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <label className="text-xs font-medium text-slate-600">Status<select name="status" defaultValue={lead.status} className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900">{editableLeadStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
                    <label className="text-xs font-medium text-slate-600">Next follow-up<input name="nextFollowUpAt" type="date" defaultValue={dateInputValue(lead.nextFollowUpAt)} className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900" /></label>
                    <label className="text-xs font-medium text-slate-600 sm:col-span-2">Update notes<textarea name="notes" rows={1} maxLength={5000} defaultValue={lead.notes ?? ""} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900" /></label>
                    <button type="submit" className="h-9 rounded-md bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900 sm:col-span-2 lg:col-span-4">Save follow-up update</button>
                  </form>
                  ) : (
                    <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                      This enquiry is linked to a patient record. <a className="font-semibold underline" href={`/clinic/${membership.clinicId}/patients/${lead.convertedPatientId}`}>Open patient record</a>
                    </p>
                  )}
                  {!lead.convertedPatientId && lead.status !== PatientLeadStatus.LOST ? (
                    <form action={convertPatientLeadToPatient>
                      <input type="hidden" name="clinicId" value={membership.clinicId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <button type="submit" className="h-9 rounded-md border border-teal-700 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50">Convert to patient record</button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div> : <p className="p-8 text-center text-sm text-slate-500">No enquiries match this view yet. Add the first enquiry above to start tracking follow-ups.</p>}
        </section>
      </div>
    </AppShell>
  );
}

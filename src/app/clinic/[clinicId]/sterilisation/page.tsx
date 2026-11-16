import { InstrumentPouchStatus, SterilisationCycleResult } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createInfectionControlLog,
  createInstrumentPouch,
  createSterilisationCycle,
  recordSterilisationCycleResult,
  updateInstrumentPouchStatus,
} from "@/features/sterilisation/actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  "cycle-created": "Sterilisation load recorded. Add the measured cycle result after the run.",
  "cycle-updated": "Cycle result saved.",
  "pouch-created": "Instrument pouch registered against a passed cycle.",
  "pouch-updated": "Pouch status updated.",
  "log-created": "Infection-control record saved.",
  "upgrade-required": "Sterilisation tracking is not included in your current plan.",
  "subscription-restricted": "Your subscription is inactive. Restore or renew it to make changes.",
  duplicate: "That load reference or pouch code is already in use.",
  "indicators-must-pass": "A cycle cannot pass unless both chemical and biological indicators pass.",
  "failure-reason-required": "Add a reason or observation before recording a failed cycle.",
  "cycle-already-final": "This cycle has already been finalised and cannot be changed.",
  "cycle-not-passed": "Pouches can only be registered against a passed cycle and a valid expiry date.",
  "pouch-not-usable": "Only an unexpired sterile pouch can be marked as used. Quarantined or used pouches cannot be reused.",
  "pouch-not-found": "That pouch could not be found.",
  "invalid-expiry": "Enter a valid expiry date.",
  error: "We couldn't save the sterilisation record. Please try again.",
};

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function SterilisationPage({
  params,
  searchParams,
}: {
  params: { clinicId: string };
  searchParams?: { status?: string };
}) {
  const parsed = z.string().uuid().safeParse(params.clinicId);
  if (!parsed.success) notFound();
  let membership;
  try {
    membership = await requireClinicMembership(parsed.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const [clinic, cycles, pouches, logs] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: membership.clinicId }, select: { name: true, timeZone: true } }),
    prisma.sterilisationCycle.findMany({
      where: { clinicId: membership.clinicId },
      orderBy: { startedAt: "desc" },
      take: 60,
      select: {
        id: true, loadReference: true, sterilizerName: true, loadDescription: true,
        startedAt: true, completedAt: true, temperatureC: true, pressureBar: true,
        durationMinutes: true, chemicalIndicatorPass: true, biologicalIndicatorPass: true,
        result: true, operator: { select: { user: { select: { displayName: true, email: true } } } },
      },
    }),
    prisma.instrumentPouch.findMany({
      where: { clinicId: membership.clinicId },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
      take: 80,
      select: {
        id: true, pouchCode: true, contents: true, expiresAt: true, status: true,
        cycle: { select: { loadReference: true, result: true } },
      },
    }),
    prisma.infectionControlLog.findMany({
      where: { clinicId: membership.clinicId },
      orderBy: { performedAt: "desc" },
      take: 50,
      select: { id: true, recordType: true, area: true, details: true, outcome: true, performedAt: true, recordedBy: { select: { user: { select: { displayName: true } } } } },
    }),
  ]);
  if (!clinic) notFound();
  const canManage = membership.role === "OWNER";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timeZone }).format(new Date());
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const pendingCycles = cycles.filter((cycle) => cycle.result === SterilisationCycleResult.PENDING);
  const activePouches = pouches.filter((pouch) => pouch.status === InstrumentPouchStatus.STERILE && pouch.expiresAt >= todayDate);
  const expiredPouches = pouches.filter((pouch) => pouch.status === InstrumentPouchStatus.STERILE && pouch.expiresAt < todayDate);
  const statusMessage = searchParams?.status ? messages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="sterilisation" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Sterilisation & infection control</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Record autoclave loads, indicator results, instrument pouch traceability, and routine infection-control checks. These records support clinic processes; they do not certify regulatory compliance.
          </p>
        </header>
        {statusMessage ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{statusMessage}</p> : null}

        <section className="grid gap-4 sm:grid-cols-4" aria-label="Sterilisation summary">
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Cycles awaiting result</p><p className="mt-2 text-3xl font-semibold text-amber-700">{pendingCycles.length}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Passed cycles</p><p className="mt-2 text-3xl font-semibold text-emerald-700">{cycles.filter((cycle) => cycle.result === "PASS").length}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Usable pouches</p><p className="mt-2 text-3xl font-semibold text-slate-900">{activePouches.length}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Expired / review</p><p className="mt-2 text-3xl font-semibold text-amber-700">{expiredPouches.length}</p></article>
        </section>

        {canManage ? (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Record a steriliser load</h2>
              <p className="mt-1 text-sm text-slate-500">Create a load record first. Enter actual readings and indicator outcomes when the cycle finishes.</p>
              <form action={createSterilisationCycle} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="clinicId" value={membership.clinicId} />
                <label className="text-sm font-medium text-slate-700">Load reference<input required name="loadReference" maxLength={80} placeholder="AUTO-2026-001" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <label className="text-sm font-medium text-slate-700">Steriliser / autoclave<input required name="sterilizerName" maxLength={120} placeholder="Autoclave 1" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Load contents<input required name="loadDescription" maxLength={500} placeholder="Handpieces, mirrors, extraction forceps…" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes<input name="notes" maxLength={1000} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <div className="flex items-end"><button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Create load record</button></div>
              </form>
            </section>

            {pendingCycles.length ? <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Complete cycle records</h2>
              <div className="mt-4 divide-y divide-slate-100">
                {pendingCycles.map((cycle) => <form key={cycle.id} action={recordSterilisationCycleResult} className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="clinicId" value={membership.clinicId} /><input type="hidden" name="cycleId" value={cycle.id} />
                  <div className="sm:col-span-2"><p className="font-medium text-slate-900">{cycle.loadReference} · {cycle.sterilizerName}</p><p className="text-xs text-slate-500">{cycle.loadDescription}</p></div>
                  <label className="text-sm text-slate-700">Temperature °C<input required name="temperatureC" type="number" min="0" max="300" step="0.1" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <label className="text-sm text-slate-700">Pressure bar<input required name="pressureBar" type="number" min="0" max="30" step="0.01" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <label className="text-sm text-slate-700">Duration (minutes)<input required name="durationMinutes" type="number" min="1" max="600" step="1" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <label className="text-sm text-slate-700">Chemical indicator<select name="chemicalIndicatorPass" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3"><option value="true">Pass</option><option value="false">Fail</option></select></label>
                  <label className="text-sm text-slate-700">Biological indicator<select name="biologicalIndicatorPass" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3"><option value="true">Pass</option><option value="false">Fail</option></select></label>
                  <label className="text-sm text-slate-700">Cycle result<select name="result" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3"><option value="PASS">Passed</option><option value="FAIL">Failed</option></select></label>
                  <label className="text-sm text-slate-700 sm:col-span-2">Result notes / failure reason<input name="resultNotes" maxLength={1000} placeholder="Required for failed cycles" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <div className="flex items-end"><button type="submit" className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">Save result</button></div>
                </form>)}
              </div>
            </section> : null}

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Register instrument pouch</h2>
              <p className="mt-1 text-sm text-slate-500">Only a passed load can be used to create a sterile pouch record.</p>
              <form action={createInstrumentPouch} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="clinicId" value={membership.clinicId} />
                <label className="text-sm font-medium text-slate-700">Passed cycle<select required name="cycleId" defaultValue="" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"><option value="" disabled>Select passed cycle</option>{cycles.filter((cycle) => cycle.result === "PASS").map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.loadReference} · {cycle.sterilizerName}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700">Pouch code<input required name="pouchCode" maxLength={80} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <label className="text-sm font-medium text-slate-700">Contents<input required name="contents" maxLength={500} placeholder="Basic examination set" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <label className="text-sm font-medium text-slate-700">Sterile until<input required name="expiresAt" type="date" min={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <div className="flex items-end"><button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Register pouch</button></div>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Daily infection-control log</h2>
              <form action={createInfectionControlLog} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="clinicId" value={membership.clinicId} />
                <label className="text-sm font-medium text-slate-700">Activity<select name="recordType" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal">{[["SURFACE_DISINFECTION","Surface disinfection"],["HAND_HYGIENE","Hand hygiene"],["PPE_CHECK","PPE check"],["BIOMEDICAL_WASTE","Biomedical waste"],["SHARPS_DISPOSAL","Sharps disposal"],["INCIDENT","Incident"],["OTHER","Other"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700">Area<input required name="area" maxLength={120} placeholder="Treatment room 1" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Details<input required name="details" maxLength={2000} placeholder="Describe the check or incident" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Outcome / corrective action<input name="outcome" maxLength={500} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
                <div className="flex items-end"><button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Save log</button></div>
              </form>
            </section>
          </>
        ) : <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">This workspace is view-only for your current clinic role. Ask an owner to record sterilisation and infection-control activity.</p>}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Sterilisation cycle history</h2><p className="mt-1 text-sm text-slate-500">Includes operator and recorded indicator results.</p></div>
          {cycles.length ? <div className="divide-y divide-slate-100">{cycles.map((cycle) => <article key={cycle.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-medium text-slate-900">{cycle.loadReference} · {cycle.sterilizerName}</p><p className="text-sm text-slate-600">{cycle.loadDescription}</p><p className="mt-1 text-xs text-slate-500">Started {dateFormat.format(cycle.startedAt)} · Operator {cycle.operator.user.displayName || cycle.operator.user.email || "Clinic member"}{cycle.temperatureC ? ` · ${cycle.temperatureC}°C` : ""}{cycle.durationMinutes ? ` · ${cycle.durationMinutes} min` : ""}</p><p className="text-xs text-slate-500">Chemical indicator: {cycle.chemicalIndicatorPass === null ? "Not recorded" : cycle.chemicalIndicatorPass ? "Pass" : "Fail"} · Biological indicator: {cycle.biologicalIndicatorPass === null ? "Not recorded" : cycle.biologicalIndicatorPass ? "Pass" : "Fail"}</p></div><span className={cycle.result === "PASS" ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800" : cycle.result === "FAIL" ? "rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"}>{cycle.result}</span></article>)}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">No sterilisation cycles recorded yet.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Instrument pouch register</h2><p className="mt-1 text-sm text-slate-500">Expired sterile pouches are highlighted and cannot be marked as used.</p></div>
          {pouches.length ? <div className="divide-y divide-slate-100">{pouches.map((pouch) => { const expired = pouch.status === "STERILE" && pouch.expiresAt < todayDate; return <article key={pouch.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-medium text-slate-900">{pouch.pouchCode} · {pouch.contents}</p><p className="text-xs text-slate-500">Load {pouch.cycle.loadReference} · Sterile until {dateFormat.format(pouch.expiresAt)}</p></div><div className="flex items-center gap-2"><span className={expired || pouch.status === "QUARANTINED" ? "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800" : pouch.status === "USED" ? "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700" : "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"}>{expired ? "EXPIRED" : pouch.status}</span>{canManage && pouch.status === "STERILE" && !expired ? <><form action={updateInstrumentPouchStatus}><input type="hidden" name="clinicId" value={membership.clinicId} /><input type="hidden" name="pouchId" value={pouch.id} /><input type="hidden" name="status" value="USED" /><button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold">Mark used</button></form><form action={updateInstrumentPouchStatus}><input type="hidden" name="clinicId" value={membership.clinicId} /><input type="hidden" name="pouchId" value={pouch.id} /><input type="hidden" name="status" value="QUARANTINED" /><button className="h-9 rounded-md border border-amber-300 px-3 text-xs font-semibold text-amber-800">Quarantine</button></form></> : null}</div></article>; })}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">No instrument pouches registered yet.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Infection-control activity</h2></div>
          {logs.length ? <div className="divide-y divide-slate-100">{logs.map((log) => <article key={log.id} className="px-5 py-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium text-slate-900">{log.recordType.replaceAll("_"," ") } · {log.area}</p><p className="text-xs text-slate-500">{dateFormat.format(log.performedAt)} · {log.recordedBy.user.displayName || "Clinic member"}</p></div><p className="mt-1 text-sm text-slate-700">{log.details}</p>{log.outcome ? <p className="mt-1 text-xs text-slate-500">Outcome: {log.outcome}</p> : null}</article>)}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">No infection-control activity recorded yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}

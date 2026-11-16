import { DentalLabOrderStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createDentalLabOrder,
  createDentalLabPartner,
  updateDentalLabOrderStatus,
} from "@/features/dental-lab/actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const statusLabels: Record<DentalLabOrderStatus, string> = {
  DRAFT: "Draft",
  SENT_TO_LAB: "Sent to lab",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  READY: "Ready",
  DISPATCHED: "Dispatched",
  RECEIVED: "Received",
  FITTED: "Fitted",
  REMAKE_REQUESTED: "Remake requested",
  CANCELLED: "Cancelled",
};
const statusMessages: Record<string, string> = {
  "partner-created": "Laboratory partner added.",
  "order-created": "Lab work order created.",
  "order-updated": "Work order status updated.",
  "duplicate-partner": "A partner with this name already exists.",
  "upgrade-required": "Dental laboratory management is not included in your current plan. Upgrade to use it.",
  "subscription-restricted": "Your subscription is inactive. Restore or renew it to make changes.",
  "invalid-selection": "Choose an active patient and laboratory partner from this clinic.",
  "invalid-transition": "That status change is not allowed. Refresh the page and try again.",
  "remake-reason-required": "Add a reason before requesting a remake.",
  "order-not-found": "That work order is no longer available.",
  error: "We couldn't save the laboratory update. Please try again.",
};

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const moneyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default async function DentalLabPage({
  params,
  searchParams,
}: {
  params: { clinicId: string };
  searchParams?: { status?: string };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();
  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }
  const [clinic, patients, treatmentPlans, partners, orders] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: membership.clinicId },
      select: { name: true },
    }),
    prisma.patient.findMany({
      where: { clinicId: membership.clinicId, archivedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, phoneNumber: true },
    }),
    prisma.treatmentPlan.findMany({
      where: { clinicId: membership.clinicId, status: "ACTIVE" },
      orderBy: [{ patient: { fullName: "asc" } }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        patient: { select: { fullName: true } },
      },
    }),
    prisma.dentalLabPartner.findMany({
      where: { clinicId: membership.clinicId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, contactName: true },
    }),
    prisma.dentalLabOrder.findMany({
      where: { clinicId: membership.clinicId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        workType: true,
        toothNumbers: true,
        material: true,
        shade: true,
        status: true,
        dueDate: true,
        quotedAmount: true,
        trackingReference: true,
        remakeReason: true,
        patient: { select: { fullName: true, phoneNumber: true } },
        partner: { select: { name: true } },
      },
    }),
  ]);
  if (!clinic) notFound();
  const canManage = membership.role === "OWNER";
  const message = searchParams?.status ? statusMessages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="lab" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Dental laboratory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Coordinate external labs, track restorations from dispatch to fitting, and keep patient-specific specifications in one place.
          </p>
        </header>

        {message ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Open work orders</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{orders.filter((order) => !["FITTED", "CANCELLED"].includes(order.status)).length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Due / overdue</p>
            <p className="mt-2 text-3xl font-semibold text-amber-700">{orders.filter((order) => !["FITTED", "CANCELLED"].includes(order.status) && order.dueDate < new Date(new Date().toISOString().slice(0, 10))).length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Active lab partners</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{partners.length}</p>
          </article>
        </section>

        {canManage ? (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Create work order</h2>
              <p className="mt-1 text-sm text-slate-500">Create a patient-linked job card with tooth, material, shade and due-date details.</p>
              <form action={createDentalLabOrder} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="clinicId" value={membership.clinicId} />
                <label className="text-sm font-medium text-slate-700">Patient
                  <select required name="patientId" defaultValue="" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal">
                    <option value="" disabled>Select patient</option>
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.fullName} · {patient.phoneNumber}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Laboratory partner
                  <select required name="partnerId" defaultValue="" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal">
                    <option value="" disabled>Select lab</option>
                    {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Treatment plan (optional)
                  <select name="treatmentPlanId" defaultValue="" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal">
                    <option value="">Not linked to a plan</option>
                    {treatmentPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.patient.fullName} · {plan.name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Work type
                  <select name="workType" required defaultValue="Crown" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal">
                    {["Crown", "Bridge", "Denture", "Implant prosthesis", "Aligner / retainer", "Night guard", "Inlay / onlay", "Other"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Due date
                  <input required type="date" name="dueDate" min={new Date().toISOString().slice(0, 10)} defaultValue={new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Tooth number(s)
                  <input name="toothNumbers" maxLength={120} placeholder="e.g. 16, 17 or 11–21" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Material
                  <input name="material" maxLength={120} placeholder="Zirconia, PFM, acrylic…" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Shade
                  <input name="shade" maxLength={40} placeholder="A2 / BL2" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Lab quote (₹)
                  <input name="quotedAmount" type="number" min="0" step="0.01" placeholder="Optional" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-4">Instructions
                  <textarea name="instructions" maxLength={2000} rows={3} placeholder="Margin design, occlusion, contact points, implant system, special instructions…" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
                </label>
                <div className="sm:col-span-2 lg:col-span-4">
                  <button type="submit" disabled={!patients.length || !partners.length} className="rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">Create work order</button>
                  {!partners.length ? <p className="mt-2 text-xs text-amber-700">Add a laboratory partner below before creating a work order.</p> : null}
                </div>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Add laboratory partner</h2>
              <form action={createDentalLabPartner} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="clinicId" value={membership.clinicId} />
                <label className="text-sm font-medium text-slate-700">Lab name
                  <input required name="name" minLength={2} maxLength={160} placeholder="Smile Ceramics Lab" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Contact person
                  <input name="contactName" maxLength={120} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Phone
                  <input name="phone" maxLength={20} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Email
                  <input name="email" type="email" maxLength={254} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address
                  <input name="address" maxLength={500} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <div className="flex items-end"><button type="submit" className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Add partner</button></div>
              </form>
              {partners.length ? <ul className="mt-4 flex flex-wrap gap-2">{partners.map((partner) => <li key={partner.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">{partner.name}{partner.contactName ? ` · ${partner.contactName}` : ""}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No lab partners added yet.</p>}
            </section>
          </>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Work orders are view-only for your current clinic role. Ask an owner to manage laboratory jobs.</p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Lab work orders</h2>
            <p className="mt-1 text-sm text-slate-500">Showing the latest 100 work orders, ordered by due date.</p>
          </div>
          {orders.length ? (
            <div className="divide-y divide-slate-100">
              {orders.map((order) => {
                const overdue = !["FITTED", "CANCELLED"].includes(order.status) && order.dueDate < new Date(new Date().toISOString().slice(0, 10));
                return (
                  <article key={order.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{order.workType} · {order.patient.fullName}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overdue ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{statusLabels[order.status]}</span>
                        {overdue ? <span className="text-xs font-semibold text-amber-700">Overdue</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{order.partner.name} · Due {dateFormat.format(order.dueDate)}</p>
                      <p className="mt-1 text-xs text-slate-500">{[order.toothNumbers ? `Tooth ${order.toothNumbers}` : null, order.material, order.shade ? `Shade ${order.shade}` : null].filter(Boolean).join(" · ") || "No technical specifications added"}</p>
                      {order.quotedAmount !== null ? <p className="mt-1 text-xs text-slate-500">Lab quote: {moneyFormat.format(Number(order.quotedAmount))}</p> : null}
                      {order.trackingReference ? <p className="mt-1 text-xs text-slate-500">Tracking: {order.trackingReference}</p> : null}
                      {order.remakeReason ? <p className="mt-1 text-xs text-rose-700">Remake: {order.remakeReason}</p> : null}
                    </div>
                    {canManage && order.status !== "CANCELLED" && order.status !== "FITTED" ? (
                      <form action={updateDentalLabOrderStatus} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="clinicId" value={membership.clinicId} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <label className="text-xs text-slate-500">Next status
                          <select name="status" defaultValue="" required className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-900">
                            <option value="" disabled>Choose status</option>
                            {(order.status === "DRAFT" ? ["SENT_TO_LAB", "CANCELLED"] :
                              order.status === "SENT_TO_LAB" ? ["ACCEPTED", "IN_PROGRESS", "CANCELLED"] :
                              order.status === "ACCEPTED" ? ["IN_PROGRESS", "CANCELLED"] :
                              order.status === "IN_PROGRESS" ? ["READY", "REMAKE_REQUESTED", "CANCELLED"] :
                              order.status === "READY" ? ["DISPATCHED", "RECEIVED", "REMAKE_REQUESTED"] :
                              order.status === "DISPATCHED" ? ["RECEIVED", "REMAKE_REQUESTED"] :
                              order.status === "RECEIVED" ? ["FITTED", "REMAKE_REQUESTED"] :
                              order.status === "FITTED" ? ["REMAKE_REQUESTED"] :
                              order.status === "REMAKE_REQUESTED" ? ["SENT_TO_LAB", "CANCELLED"] : []).map((status) => <option key={status} value={status}>{statusLabels[status as DentalLabOrderStatus]}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-slate-500">Tracking ref.
                          <input name="trackingReference" defaultValue={order.trackingReference ?? ""} maxLength={120} className="mt-1 block h-9 w-32 rounded-md border border-slate-300 px-2 text-sm text-slate-900" />
                        </label>
                        <label className="text-xs text-slate-500">Remake reason (if needed)
                          <input name="remakeReason" maxLength={1000} className="mt-1 block h-9 w-40 rounded-md border border-slate-300 px-2 text-sm text-slate-900" />
                        </label>
                        <button type="submit" className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700">Update</button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : <p className="px-5 py-10 text-center text-sm text-slate-500">No laboratory work orders yet. Add a lab partner and create the first job card.</p>}
        </section>
      </div>
    </AppShell>
  );
}

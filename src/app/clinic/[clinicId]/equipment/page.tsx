import { ClinicEquipmentStatus, EquipmentMaintenanceType } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createClinicEquipment,
  recordEquipmentMaintenance,
  updateClinicEquipmentStatus,
} from "@/features/equipment/actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const messages: Record<string, string> = {
  "equipment-created": "Equipment added to the clinic register.",
  "maintenance-recorded": "Maintenance record saved and due dates updated.",
  "status-updated": "Equipment status updated.",
  "duplicate-serial": "That serial number is already registered in this clinic.",
  "equipment-not-found": "That equipment record is unavailable or retired.",
  "upgrade-required": "Equipment management is not included in your current plan.",
  "subscription-restricted": "Your subscription is inactive. Restore or renew it to make changes.",
  "invalid-date": "Enter valid calendar dates.",
  error: "We couldn't save the equipment update. Please try again.",
};

export default async function EquipmentPage({
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
  const [clinic, equipment, records] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: membership.clinicId }, select: { name: true, timeZone: true } }),
    prisma.clinicEquipment.findMany({
      where: { clinicId: membership.clinicId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 150,
      select: {
        id: true, name: true, equipmentType: true, brand: true, model: true, serialNumber: true,
        location: true, purchaseDate: true, warrantyUntil: true, amcUntil: true,
        nextServiceDue: true, nextCalibrationDue: true, status: true,
        maintenanceRecords: { orderBy: { serviceDate: "desc" }, take: 1, select: { serviceDate: true, maintenanceType: true, vendor: true } },
      },
    }),
    prisma.equipmentMaintenanceRecord.findMany({
      where: { clinicId: membership.clinicId },
      orderBy: { serviceDate: "desc" },
      take: 60,
      select: { id: true, serviceDate: true, maintenanceType: true, vendor: true, description: true, cost: true, equipment: { select: { name: true } }, recordedBy: { select: { user: { select: { displayName: true } } } } },
    }),
  ]);
  if (!clinic) notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timeZone }).format(new Date());
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const isDue = (date: Date | null) => date !== null && date <= todayDate;
  const dueService = equipment.filter((item) => item.status === ClinicEquipmentStatus.ACTIVE && isDue(item.nextServiceDue));
  const dueCalibration = equipment.filter((item) => item.status === ClinicEquipmentStatus.ACTIVE && isDue(item.nextCalibrationDue));
  const outOfService = equipment.filter((item) => item.status === ClinicEquipmentStatus.OUT_OF_SERVICE);
  const canManage = membership.role === "OWNER";
  const message = searchParams?.status ? messages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="equipment" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Equipment & maintenance</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Maintain a register of dental chairs, autoclaves, compressors, X-ray units and other clinic assets. Track warranty, AMC, service and calibration due dates.</p>
        </header>
        {message ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p> : null}

        <section className="grid gap-4 sm:grid-cols-4" aria-label="Equipment summary">
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Registered assets</p><p className="mt-2 text-3xl font-semibold text-slate-900">{equipment.filter((item) => item.status !== "RETIRED").length}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Service due / overdue</p><p className="mt-2 text-3xl font-semibold text-amber-700">{dueService.length}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Calibration due</p><p className="mt-2 text-3xl font-semibold text-amber-700">{dueCalibration.length}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Out of service</p><p className="mt-2 text-3xl font-semibold text-rose-700">{outOfService.length}</p></article>
        </section>

        {canManage ? <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Register equipment</h2>
            <form action={createClinicEquipment} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="clinicId" value={membership.clinicId} />
              <label className="text-sm font-medium text-slate-700">Asset name<input required name="name" maxLength={160} placeholder="Main dental chair" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Equipment type<select name="equipmentType" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal">{[["DENTAL_CHAIR","Dental chair"],["AUTOCLAVE","Autoclave"],["COMPRESSOR","Compressor"],["X_RAY","X-ray unit"],["INTRAORAL_SCANNER","Intraoral scanner"],["ULTRASONIC_SCALER","Ultrasonic scaler"],["OTHER","Other"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Brand<input name="brand" maxLength={120} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Model<input name="model" maxLength={120} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Serial number<input name="serialNumber" maxLength={120} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Location<input name="location" maxLength={120} placeholder="Surgery room 1" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Purchase date<input name="purchaseDate" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Warranty until<input name="warrantyUntil" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">AMC until<input name="amcUntil" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Next service due<input name="nextServiceDue" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Next calibration due<input name="nextCalibrationDue" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes<input name="notes" maxLength={1000} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <div className="flex items-end"><button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Add equipment</button></div>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Record service, repair or calibration</h2>
            <form action={recordEquipmentMaintenance} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="clinicId" value={membership.clinicId} />
              <label className="text-sm font-medium text-slate-700">Equipment<select required name="equipmentId" defaultValue="" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"><option value="" disabled>Select asset</option>{equipment.filter((item) => item.status !== "RETIRED").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Maintenance type<select name="maintenanceType" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal">{[["SERVICE","Service"],["REPAIR","Repair"],["CALIBRATION","Calibration"],["INSPECTION","Inspection"],["AMC_RENEWAL","AMC renewal"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Service date<input required name="serviceDate" type="date" defaultValue={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Vendor / technician<input name="vendor" maxLength={160} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Work performed<input required name="description" maxLength={2000} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Cost (₹)<input name="cost" type="number" min="0" step="0.01" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Invoice / reference<input name="reference" maxLength={120} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Next service due<input name="nextServiceDue" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Next calibration due<input name="nextCalibrationDue" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" /></label>
              <div className="flex items-end"><button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Save maintenance</button></div>
            </form>
          </section>
        </> : <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Equipment records are view-only for your current clinic role. Ask an owner to update asset and maintenance details.</p>}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Equipment register</h2></div>
          {equipment.length ? <div className="divide-y divide-slate-100">{equipment.map((item) => {
            const serviceDue = isDue(item.nextServiceDue) && item.status === "ACTIVE";
            const calibrationDue = isDue(item.nextCalibrationDue) && item.status === "ACTIVE";
            return <article key={item.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.equipmentType.replaceAll("_"," ")} · {[item.brand,item.model,item.serialNumber ? `S/N ${item.serialNumber}` : null,item.location].filter(Boolean).join(" · ") || "No asset details"}</p><p className="mt-1 text-xs text-slate-500">Warranty {item.warrantyUntil ? dateFormat.format(item.warrantyUntil) : "not recorded"} · AMC {item.amcUntil ? dateFormat.format(item.amcUntil) : "not recorded"}</p><p className="text-xs text-slate-500">Service due {item.nextServiceDue ? dateFormat.format(item.nextServiceDue) : "not scheduled"} · Calibration due {item.nextCalibrationDue ? dateFormat.format(item.nextCalibrationDue) : "not scheduled"}</p>{item.maintenanceRecords[0] ? <p className="text-xs text-slate-500">Last: {item.maintenanceRecords[0].maintenanceType.replaceAll("_"," ")} · {dateFormat.format(item.maintenanceRecords[0].serviceDate)}{item.maintenanceRecords[0].vendor ? ` · ${item.maintenanceRecords[0].vendor}` : ""}</p> : null}</div>
              <div className="flex flex-wrap items-center gap-2"><span className={item.status === "OUT_OF_SERVICE" ? "rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800" : item.status === "RETIRED" ? "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700" : "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"}>{item.status.replaceAll("_"," ")}</span>{serviceDue ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Service due</span> : null}{calibrationDue ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Calibration due</span> : null}{canManage && item.status !== "RETIRED" ? <form action={updateClinicEquipmentStatus} className="flex items-center gap-1"><input type="hidden" name="clinicId" value={membership.clinicId} /><input type="hidden" name="equipmentId" value={item.id} /><select name="status" defaultValue={item.status} className="h-9 rounded-md border border-slate-300 px-2 text-xs"><option value="ACTIVE">Active</option><option value="OUT_OF_SERVICE">Out of service</option><option value="RETIRED">Retired</option></select><button type="submit" className="h-9 rounded-md border border-slate-300 px-2 text-xs font-semibold">Save</button></form> : null}</div>
            </article>;
          })}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">No equipment registered yet.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Maintenance history</h2></div>
          {records.length ? <div className="divide-y divide-slate-100">{records.map((record) => <article key={record.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"><div><p className="font-medium text-slate-900">{record.equipment.name} · {record.maintenanceType.replaceAll("_"," ")}</p><p className="mt-1 text-sm text-slate-700">{record.description}</p><p className="text-xs text-slate-500">{dateFormat.format(record.serviceDate)} · {record.vendor || "Vendor not recorded"} · {record.recordedBy.user.displayName || "Clinic member"}</p></div><p className="text-sm font-semibold text-slate-900">{record.cost === null ? "—" : moneyFormat.format(Number(record.cost))}</p></article>)}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">Maintenance history will appear here.</p>}
        </section>
      </div>
    </AppShell>
  );
}

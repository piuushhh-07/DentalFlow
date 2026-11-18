import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createInventoryPurchaseOrder,
  createInventorySupplier,
  receiveInventoryPurchaseOrderLine,
  returnInventoryBatchToSupplier,
} from "@/features/inventory/procurement-actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  "supplier-created": "Supplier saved.",
  "order-created": "Purchase order created.",
  received: "Goods received and stock updated.",
  "supplier-returned": "Supplier return recorded and stock quantities updated.",
  "batch-not-returnable": "This batch has no active linked supplier and cannot be returned through this workflow.",
  "insufficient-return-stock": "The return quantity exceeds the remaining batch or clinic stock.",
  duplicate: "That supplier name or batch number already exists.",
  "over-received": "Received quantity cannot exceed the outstanding order quantity.",
  "order-not-receivable": "This purchase order is no longer open for receiving.",
  "upgrade-required": "Inventory procurement is not included in your current plan.",
  "subscription-restricted": "Restore your clinic subscription to make inventory changes.",
  error: "We couldn't save the procurement change. Please try again.",
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export default async function InventoryProcurementPage({
  params, searchParams,
}: { params: { clinicId: string }; searchParams?: { status?: string } }) {
  const parsed = z.string().uuid().safeParse(params.clinicId);
  if (!parsed.success) notFound();
  let membership;
  try { membership = await requireClinicMembership(parsed.data); }
  catch (error) { if (error instanceof ClinicAccessDeniedError) notFound(); throw error; }

  const [clinic, suppliers, items, orders, returnableBatches, recentReturns] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: membership.clinicId }, select: { name: true } }),
    prisma.inventorySupplier.findMany({ where: { clinicId: membership.clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.inventoryItem.findMany({ where: { clinicId: membership.clinicId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, unitCost: true, currentStock: true } }),
    prisma.inventoryPurchaseOrder.findMany({ where: { clinicId: membership.clinicId }, orderBy: { orderedAt: "desc" }, take: 50, include: { supplier: { select: { name: true } }, lines: { include: { item: { select: { name: true, unit: true } } } } } }),
    prisma.inventoryBatch.findMany({
      where: { clinicId: membership.clinicId, quantityRemaining: { gt: 0 }, supplierId: { not: null }, supplier: { active: true } },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
      take: 100,
      include: { item: { select: { name: true, unit: true } }, supplier: { select: { name: true } } },
    }),
    prisma.inventoryTransaction.findMany({
      where: { clinicId: membership.clinicId, type: "SUPPLIER_RETURN" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { item: { select: { name: true, unit: true } } },
    }),
  ]);
  if (!clinic) notFound();
  const canManage = membership.role === "OWNER";
  const statusMessage = searchParams?.status ? messages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="inventory" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Procurement & suppliers</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage dental suppliers, purchase orders, goods received, batch numbers and expiry dates.</p>
          </div>
          <a href={`/clinic/${membership.clinicId}/inventory`} className="text-sm font-semibold text-teal-700 hover:underline">← Back to stock</a>
        </header>

        {statusMessage ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{statusMessage}</p> : null}

        {canManage ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Add supplier</h2>
              <form action={createInventorySupplier} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="clinicId" value={membership.clinicId} />
                <label className="text-sm text-slate-700 sm:col-span-2">Supplier name<input required name="name" minLength={2} maxLength={160} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" placeholder="Dental Supplies India" /></label>
                <label className="text-sm text-slate-700">Contact person<input name="contactName" maxLength={120} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                <label className="text-sm text-slate-700">Phone<input name="phone" maxLength={20} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                <label className="text-sm text-slate-700">Email<input name="email" type="email" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                <label className="text-sm text-slate-700">GSTIN<input name="gstin" maxLength={15} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                <label className="text-sm text-slate-700 sm:col-span-2">Address<input name="address" maxLength={500} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                <button className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 sm:col-span-2" type="submit">Save supplier</button>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Create purchase order</h2>
              {suppliers.length && items.length ? (
                <form action={createInventoryPurchaseOrder} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="clinicId" value={membership.clinicId} />
                  <label className="text-sm text-slate-700 sm:col-span-2">Supplier<select required name="supplierId" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                  <label className="text-sm text-slate-700">PO number<input required name="orderNumber" maxLength={40} placeholder="PO-2026-001" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <label className="text-sm text-slate-700">Expected delivery<input name="expectedAt" type="date" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <label className="text-sm text-slate-700 sm:col-span-2">Item<select required name="itemId" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3">{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
                  <label className="text-sm text-slate-700">Quantity<input required name="quantity" type="number" min="0.001" step="0.001" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <label className="text-sm text-slate-700">Unit cost (₹)<input required name="unitCost" type="number" min="0" step="0.01" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <label className="text-sm text-slate-700 sm:col-span-2">Notes<input name="notes" maxLength={1000} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3" /></label>
                  <button className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 sm:col-span-2" type="submit">Create purchase order</button>
                </form>
              ) : <p className="mt-3 text-sm text-slate-600">Add at least one active supplier and inventory item before creating a purchase order.</p>}
            </section>
          </div>
        ) : <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Procurement is view-only for your current role.</p>}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Suppliers</h2></div>
          {suppliers.length ? <div className="grid gap-px bg-slate-100 sm:grid-cols-2">{suppliers.map((supplier) => <article key={supplier.id} className="bg-white p-4"><p className="font-medium text-slate-900">{supplier.name}</p><p className="mt-1 text-xs text-slate-500">{[supplier.contactName, supplier.phone, supplier.email, supplier.gstin ? `GSTIN ${supplier.gstin}` : null].filter(Boolean).join(" · ") || "No contact details"}</p></article>)}</div> : <p className="p-6 text-sm text-slate-500">No suppliers have been added.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Return stock to supplier</h2>
            <p className="mt-1 text-sm text-slate-500">Return unused stock against its original supplier batch. The batch balance and clinic stock are reduced together.</p>
          </div>
          {returnableBatches.length ? (
            <div className="divide-y divide-slate-100">
              {returnableBatches.map((batch) => (
                <article key={batch.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{batch.item.name} · Batch {batch.batchNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {batch.supplier?.name ?? "Supplier unavailable"} · {Number(batch.quantityRemaining)} {batch.item.unit} available to return
                      {batch.expiryDate ? ` · Expiry ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(batch.expiryDate)}` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <form action={returnInventoryBatchToSupplier} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="clinicId" value={membership.clinicId} />
                      <input type="hidden" name="batchId" value={batch.id} />
                      <label className="text-xs text-slate-500">Return qty
                        <input required name="quantity" type="number" min="0.001" max={Number(batch.quantityRemaining)} step="0.001" className="mt-1 block h-9 w-24 rounded-md border border-slate-300 px-2 text-sm text-slate-900" />
                      </label>
                      <label className="text-xs text-slate-500">Reason
                        <input required name="reason" minLength={3} maxLength={400} placeholder="Unused / wrong item" className="mt-1 block h-9 w-48 rounded-md border border-slate-300 px-2 text-sm text-slate-900" />
                      </label>
                      <button className="h-9 rounded-md border border-amber-700 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50" type="submit">Record return</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : <p className="p-6 text-sm text-slate-500">No supplier-linked batches currently have stock available to return.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent supplier returns</h2>
            <p className="mt-1 text-sm text-slate-500">Return history is recorded in the inventory transaction audit trail.</p>
          </div>
          {recentReturns.length ? (
            <div className="divide-y divide-slate-100">
              {recentReturns.map((entry) => (
                <article key={entry.id} className="flex flex-wrap items-start justify-between gap-2 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{entry.item.name} · {Number(entry.quantity)} {entry.item.unit} returned</p>
                    <p className="mt-1 text-xs text-slate-500">{entry.notes ?? "Supplier return"}</p>
                  </div>
                  <time className="text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(entry.createdAt)}</time>
                </article>
              ))}
            </div>
          ) : <p className="p-6 text-sm text-slate-500">No supplier returns recorded yet.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Purchase orders</h2><p className="mt-1 text-sm text-slate-500">Receive goods against the ordered quantity; every receipt records a batch and expiry date.</p></div>
          {orders.length ? <div className="divide-y divide-slate-100">{orders.map((order) => <article key={order.id} className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{order.orderNumber} · {order.supplier.name}</p><p className="text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(order.orderedAt)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{order.status.replaceAll("_", " ")}</span></div>
            {order.lines.map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><div><p className="text-sm font-medium text-slate-800">{line.item.name}</p><p className="text-xs text-slate-500">{Number(line.quantityReceived)} / {Number(line.quantityOrdered)} {line.item.unit} received · {inr.format(Number(line.unitCost))} per unit</p></div>
              {canManage && order.status !== "RECEIVED" && order.status !== "CANCELLED" && Number(line.quantityOrdered) > Number(line.quantityReceived) ? <form action={receiveInventoryPurchaseOrderLine} className="flex flex-wrap items-end gap-2"><input type="hidden" name="clinicId" value={membership.clinicId} /><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="lineId" value={line.id} /><label className="text-xs text-slate-500">Receive qty<input required name="quantity" type="number" min="0.001" max={Number(line.quantityOrdered)-Number(line.quantityReceived)} step="0.001" className="mt-1 block h-9 w-24 rounded-md border border-slate-300 px-2 text-sm text-slate-900" /></label><label className="text-xs text-slate-500">Batch no.<input required name="batchNumber" maxLength={100} className="mt-1 block h-9 w-28 rounded-md border border-slate-300 px-2 text-sm text-slate-900" /></label><label className="text-xs text-slate-500">Expiry<input name="expiryDate" type="date" className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-900" /></label><button className="h-9 rounded-md border border-teal-700 px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50" type="submit">Receive goods</button></form> : null}
            </div>)}</article>)}</div> : <p className="p-8 text-center text-sm text-slate-500">No purchase orders yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}

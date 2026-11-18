import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const quantityFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 3,
});

function clinicDate(value: Date): Date {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  return new Date(`${date}T00:00:00.000Z`);
}

export default async function InventoryBatchesPage({
  params,
}: {
  params: { clinicId: string };
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

  const [clinic, batches] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: membership.clinicId },
      select: { name: true },
    }),
    prisma.inventoryBatch.findMany({
      where: {
        clinicId: membership.clinicId,
        quantityRemaining: { gt: 0 },
      },
      orderBy: [
        { expiryDate: { sort: "asc", nulls: "last" } },
        { receivedAt: "asc" },
      ],
      select: {
        id: true,
        batchNumber: true,
        expiryDate: true,
        quantityReceived: true,
        quantityRemaining: true,
        receivedAt: true,
        item: { select: { name: true, unit: true, sku: true } },
        supplier: { select: { name: true } },
      },
    }),
  ]);

  if (!clinic) notFound();

  const today = clinicDate(new Date());
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const expired = batches.filter(
    (batch) => batch.expiryDate && batch.expiryDate < today,
  );
  const expiringSoon = batches.filter(
    (batch) =>
      batch.expiryDate &&
      batch.expiryDate >= today &&
      batch.expiryDate <= horizon,
  );
  const noExpiry = batches.filter((batch) => !batch.expiryDate);
  const safeBatches = batches.filter(
    (batch) => batch.expiryDate && batch.expiryDate > horizon,
  );

  return (
    <AppShell activeSection="inventory" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Batch & expiry tracking
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review remaining stock by batch, identify expired and soon-to-expire
            supplies, and keep batch rotation visible. Stock usage from tracked
            items consumes the earliest-expiring eligible batch first.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/clinic/${membership.clinicId}/inventory`}
              className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Inventory overview
            </a>
            <a
              href={`/clinic/${membership.clinicId}/inventory/procurement`}
              className="inline-flex h-9 items-center rounded-md border border-teal-700 px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50"
            >
              Receive stock
            </a>
          </div>
        </header>

        <section aria-label="Batch expiry summary" className="grid gap-4 sm:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">Active batches</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{batches.length}</p>
          </article>
          <article className="rounded-xl border border-rose-200 bg-white p-5">
            <p className="text-sm font-medium text-rose-700">Expired stock</p>
            <p className="mt-2 text-3xl font-semibold text-rose-700">{expired.length}</p>
          </article>
          <article className="rounded-xl border border-amber-200 bg-white p-5">
            <p className="text-sm font-medium text-amber-700">Expires in 30 days</p>
            <p className="mt-2 text-3xl font-semibold text-amber-700">{expiringSoon.length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">No expiry recorded</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{noExpiry.length}</p>
          </article>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Remaining batches</h2>
            <p className="mt-1 text-sm text-slate-500">
              Expired batches remain visible for reconciliation but are excluded from stock usage.
            </p>
          </div>
          {batches.length ? (
            <div className="divide-y divide-slate-100">
              {batches.map((batch) => {
                const isExpired = batch.expiryDate && batch.expiryDate < today;
                const isExpiring =
                  batch.expiryDate &&
                  batch.expiryDate >= today &&
                  batch.expiryDate <= horizon;
                const status = isExpired
                  ? "Expired — do not use"
                  : isExpiring
                    ? "Expiring soon"
                    : batch.expiryDate
                      ? "Within date"
                      : "No expiry recorded";
                const statusClass = isExpired
                  ? "bg-rose-50 text-rose-800"
                  : isExpiring
                    ? "bg-amber-50 text-amber-800"
                    : "bg-slate-100 text-slate-700";

                return (
                  <article key={batch.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{batch.item.name}</p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                          {status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Batch {batch.batchNumber}
                        {batch.item.sku ? ` · SKU ${batch.item.sku}` : ""}
                        {batch.supplier ? ` · ${batch.supplier.name}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Received {dateFormatter.format(batch.receivedAt)}
                        {" · "}
                        Expiry {batch.expiryDate ? dateFormatter.format(batch.expiryDate) : "Not recorded"}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-lg font-semibold text-slate-900">
                        {quantityFormatter.format(Number(batch.quantityRemaining))} {batch.item.unit}
                      </p>
                      <p className="text-xs text-slate-500">
                        of {quantityFormatter.format(Number(batch.quantityReceived))} received
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No remaining batches yet. Receive a purchase order with a batch number to start tracking expiry.
            </p>
          )}
        </section>

        <p className="text-xs leading-5 text-slate-500">
          {safeBatches.length} batch(es) have more than 30 days remaining. Items without an expiry date are not classified as expired, but should be reviewed against the supplier packaging.
        </p>
      </div>
    </AppShell>
  );
}

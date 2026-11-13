import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createInventoryItem,
  recordInventoryMovement,
} from "@/features/inventory/actions";
import { prisma } from "@/lib/db/prisma";
import { measureServerOperation } from "@/lib/performance/server-timing";

export const dynamic = "force-dynamic";

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

const statusMessages: Record<string, string> = {
  created: "Inventory item added.",
  updated: "Stock movement recorded.",
  "duplicate-sku": "That SKU is already used in this clinic.",
  "insufficient-stock":
    "Stock cannot go below zero. Check the available quantity.",
  "item-not-found": "That inventory item is no longer available.",
  error: "We couldn't save the inventory change. Please try again.",
};

export default async function ClinicInventoryPage({
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
  const [clinic, items, transactions] = await Promise.all([
    measureServerOperation("inventory.clinic", () =>
      prisma.clinic.findUnique({
        where: { id: membership.clinicId },
        select: { name: true },
      }),
    ),
    measureServerOperation("inventory.items", () =>
      prisma.inventoryItem.findMany({
        where: { clinicId: membership.clinicId, active: true },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          category: true,
          sku: true,
          unit: true,
          currentStock: true,
          reorderLevel: true,
          unitCost: true,
        },
      }),
    ),
    measureServerOperation("inventory.recent_movements", () =>
      prisma.inventoryTransaction.findMany({
        where: { clinicId: membership.clinicId },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          quantity: true,
          createdAt: true,
          reference: true,
          item: { select: { name: true, unit: true } },
        },
      }),
    ),
  ]);
  if (!clinic) notFound();
  const lowStock = items.filter((item) =>
    item.currentStock.lessThanOrEqualTo(item.reorderLevel),
  );
  const canManage = membership.role === "OWNER";
  const status = searchParams?.status
    ? statusMessages[searchParams.status]
    : undefined;

  return (
    <AppShell activeSection="inventory" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Inventory management
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Keep dental materials and clinic supplies visible. Track stock
            received and used, and spot items that need reordering.
          </p>
        </header>

        {status ? (
          <p
            role="status"
            className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"
          >
            {status}
          </p>
        ) : null}

        <section
          aria-label="Inventory summary"
          className="grid gap-4 sm:grid-cols-3"
        >
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">Active items</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {items.length.toLocaleString("en-IN")}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">
              Low-stock alerts
            </p>
            <p className="mt-2 text-3xl font-semibold text-amber-700">
              {lowStock.length.toLocaleString("en-IN")}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">
              Recent movements
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {transactions.length.toLocaleString("en-IN")}
            </p>
          </article>
        </section>

        {canManage ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Add inventory item
            </h2>
            <form
              action={createInventoryItem}
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <input
                type="hidden"
                name="clinicId"
                value={membership.clinicId}
              />
              <label className="text-sm font-medium text-slate-700">
                Item name
                <input
                  required
                  name="name"
                  minLength={2}
                  maxLength={160}
                  placeholder="Composite resin"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Category
                <input
                  name="category"
                  maxLength={100}
                  placeholder="Restorative"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                SKU / code
                <input
                  name="sku"
                  maxLength={80}
                  placeholder="RES-COMP-01"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Unit
                <input
                  required
                  name="unit"
                  defaultValue="pcs"
                  maxLength={24}
                  placeholder="pcs, box, ml"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Reorder at
                <input
                  required
                  name="reorderLevel"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue="0"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Unit cost (₹)
                <input
                  name="unitCost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <div className="flex items-end">
                <button
                  className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                  type="submit"
                >
                  Add item
                </button>
              </div>
            </form>
          </section>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Inventory is view-only for your current clinic role. Ask an owner to
            record stock changes.
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Stock overview</h2>
            <p className="mt-1 text-sm text-slate-500">
              Low-stock items are highlighted against their reorder level.
            </p>
          </div>
          {items.length ? (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const low = item.currentStock.lessThanOrEqualTo(
                  item.reorderLevel,
                );
                return (
                  <div
                    key={item.id}
                    className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {[item.category, item.sku ? `SKU ${item.sku}` : null]
                          .filter(Boolean)
                          .join(" · ") || "Uncategorized"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <p
                          className={
                            low
                              ? "font-semibold text-amber-700"
                              : "font-semibold text-slate-900"
                          }
                        >
                          {quantity.format(Number(item.currentStock))}{" "}
                          {item.unit}
                        </p>
                        <p className="text-xs text-slate-500">
                          Reorder at{" "}
                          {quantity.format(Number(item.reorderLevel))}
                        </p>
                      </div>
                      {low ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          Low stock
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          In stock
                        </span>
                      )}
                    </div>
                    {canManage ? (
                      <form
                        action={recordInventoryMovement}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input
                          type="hidden"
                          name="clinicId"
                          value={membership.clinicId}
                        />
                        <input type="hidden" name="itemId" value={item.id} />
                        <label className="text-xs text-slate-500">
                          Qty
                          <input
                            required
                            name="quantity"
                            type="number"
                            min="0.001"
                            step="0.001"
                            className="mt-1 block h-9 w-24 rounded-md border border-slate-300 px-2 text-sm text-slate-900"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Action
                          <select
                            name="type"
                            className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-900"
                          >
                            <option value="STOCK_IN">Stock in</option>
                            <option value="STOCK_OUT">Stock used</option>
                          </select>
                        </label>
                        <button
                          className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          type="submit"
                        >
                          Update
                        </button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No inventory items yet. Add your first supply above.
            </p>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">
              Recent stock movements
            </h2>
          </div>
          {transactions.length ? (
            <div className="divide-y divide-slate-100">
              {transactions.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {entry.item.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.type === "STOCK_IN"
                        ? "Stock received"
                        : entry.type === "STOCK_OUT"
                          ? "Stock used"
                          : "Adjustment"}{" "}
                      ·{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Kolkata",
                      }).format(entry.createdAt)}
                    </p>
                  </div>
                  <p
                    className={
                      entry.type === "STOCK_IN"
                        ? "font-semibold text-emerald-700"
                        : "font-semibold text-slate-700"
                    }
                  >
                    {entry.type === "STOCK_IN" ? "+" : "−"}
                    {quantity.format(Number(entry.quantity))} {entry.item.unit}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              Stock activity will appear here.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

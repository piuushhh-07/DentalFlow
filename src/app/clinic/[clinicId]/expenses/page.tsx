import { notFound } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { createClinicExpense } from "@/features/expenses/actions";
import { prisma } from "@/lib/db/prisma";
import { measureServerOperation } from "@/lib/performance/server-timing";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const categories = [
  "Rent",
  "Salaries",
  "Utilities",
  "Dental laboratory",
  "Dental supplies",
  "Equipment",
  "Maintenance",
  "Marketing",
  "Software",
  "Travel",
  "Other",
] as const;
const statusMessages: Record<string, string> = {
  created: "Clinic expense recorded.",
  error: "We couldn't save this expense. Please try again.",
};

function clinicToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function monthStart(date: string): Date {
  return new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
}

function nextMonthStart(date: string): Date {
  const start = monthStart(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export default async function ClinicExpensesPage({
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

  const clinic = await measureServerOperation("expenses.clinic", () =>
    prisma.clinic.findUnique({
      where: { id: membership.clinicId },
      select: { name: true, timeZone: true },
    }),
  );
  if (!clinic) notFound();

  const today = clinicToday(clinic.timeZone);
  const start = monthStart(today);
  const end = nextMonthStart(today);
  const [expenses, monthlyTotal, categoryTotals] = await Promise.all([
    measureServerOperation("expenses.recent_entries", () =>
      prisma.clinicExpense.findMany({
        where: { clinicId: membership.clinicId },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          description: true,
          category: true,
          vendor: true,
          amount: true,
          expenseDate: true,
          paymentMethod: true,
          reference: true,
        },
      }),
    ),
    measureServerOperation("expenses.monthly_total", () =>
      prisma.clinicExpense.aggregate({
        where: {
          clinicId: membership.clinicId,
          expenseDate: { gte: start, lt: end },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ),
    measureServerOperation("expenses.category_totals", () =>
      prisma.clinicExpense.groupBy({
        by: ["category"],
        where: {
          clinicId: membership.clinicId,
          expenseDate: { gte: start, lt: end },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
    ),
  ]);

  const canManage = membership.role === "OWNER";
  const status = searchParams?.status
    ? statusMessages[searchParams.status]
    : undefined;

  return (
    <AppShell activeSection="expenses" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Clinic expenses
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Record operating costs and understand where the clinic spends money.
            Expenses are separate from patient treatment payments.
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
          aria-label="Monthly expense summary"
          className="grid gap-4 sm:grid-cols-2"
        >
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Expenses this month
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {currency.format(Number(monthlyTotal._sum.amount ?? 0))}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {new Intl.DateTimeFormat("en-IN", {
                month: "long",
                year: "numeric",
                timeZone: clinic.timeZone,
              }).format(new Date())}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Transactions this month
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {monthlyTotal._count._all.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Recorded clinic operating expenses
            </p>
          </article>
        </section>

        {canManage ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Record an expense
            </h2>
            <form
              action={createClinicExpense}
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <input
                type="hidden"
                name="clinicId"
                value={membership.clinicId}
              />
              <label className="text-sm font-medium text-slate-700">
                Description
                <input
                  required
                  name="description"
                  minLength={2}
                  maxLength={200}
                  placeholder="Clinic rent - November"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Category
                <select
                  required
                  name="category"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Amount (₹)
                <input
                  required
                  name="amount"
                  type="number"
                  min="0.01"
                  max="1000000000"
                  step="0.01"
                  placeholder="5000.00"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Expense date
                <input
                  required
                  name="expenseDate"
                  type="date"
                  defaultValue={today}
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Vendor / paid to
                <input
                  name="vendor"
                  maxLength={160}
                  placeholder="Landlord, supplier..."
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Payment method
                <select
                  name="paymentMethod"
                  defaultValue={PaymentMethod.UPI}
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                >
                  {Object.values(PaymentMethod).map((method) => (
                    <option key={method} value={method}>
                      {method.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Reference
                <input
                  name="reference"
                  maxLength={120}
                  placeholder="Receipt / transaction ID"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                Notes
                <input
                  name="notes"
                  maxLength={500}
                  placeholder="Optional details"
                  className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Save expense
                </button>
              </div>
            </form>
          </section>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Expense records are view-only for your current clinic role.
          </p>
        )}

        {categoryTotals.length ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Spending by category · this month
            </h2>
            <div className="mt-4 space-y-3">
              {categoryTotals.map((item) => (
                <div
                  key={item.category}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="font-medium text-slate-700">
                    {item.category}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {currency.format(Number(item._sum.amount ?? 0))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent expenses</h2>
            <p className="mt-1 text-sm text-slate-500">
              Latest 100 entries for this clinic.
            </p>
          </div>
          {expenses.length ? (
            <div className="divide-y divide-slate-100">
              {expenses.map((expense) => (
                <article
                  key={expense.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {expense.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {expense.category}
                      {expense.vendor ? ` · ${expense.vendor}` : ""} ·{" "}
                      {dateFormatter.format(expense.expenseDate)} ·{" "}
                      {expense.paymentMethod.replaceAll("_", " ")}
                    </p>
                    {expense.reference ? (
                      <p className="mt-1 text-xs text-slate-400">
                        Ref: {expense.reference}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-semibold tabular-nums text-slate-900">
                    {currency.format(Number(expense.amount))}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No expenses recorded yet. Add the clinic&apos;s first expense
              above.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

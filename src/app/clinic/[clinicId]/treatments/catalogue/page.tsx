import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TreatmentCatalogStatus } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { listClinicTreatmentCatalogue } from "@/features/treatments/lib/treatment-finance";
import { TreatmentCatalogueForm } from "@/features/treatments/components/treatment-catalogue-form";
import { TreatmentCatalogueStatusForm } from "@/features/treatments/components/treatment-catalogue-status-form";

export const dynamic = "force-dynamic";

export default async function TreatmentCataloguePage({
  params,
  searchParams,
}: {
  params: { clinicId: string };
  searchParams: { edit?: string };
}) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();
  let membership;
  try {
    membership = await requireClinicMembership(parsedClinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const items = await listClinicTreatmentCatalogue(membership.clinicId);
  const itemToEdit = searchParams.edit
    ? items.find((item) => item.id === searchParams.edit)
    : undefined;
  if (searchParams.edit && !itemToEdit) notFound();

  return (
    <AppShell activeSection="treatments" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-5xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`/clinic/${membership.clinicId}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Dashboard
        </Link>
        <header className="mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Treatment catalogue
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Clinic-specific procedures and default prices. Inactive entries
            remain available in treatment history.
          </p>
        </header>

        {membership.role === "OWNER" ? (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              {itemToEdit ? "Edit treatment" : "Add a treatment"}
            </h2>
            <TreatmentCatalogueForm
              clinicId={membership.clinicId}
              item={
                itemToEdit
                  ? {
                      ...itemToEdit,
                      defaultPrice: itemToEdit.defaultPrice?.toFixed(2) ?? null,
                    }
                  : undefined
              }
            />
          </section>
        ) : (
          <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Only clinic owners can manage the treatment catalogue.
          </p>
        )}

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Clinic treatments</h2>
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">
              No catalogue items yet. Add a procedure above to use it in
              treatment plans.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => {
                const active = item.status === TreatmentCatalogStatus.ACTIVE;
                return (
                  <li
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-slate-900">
                          {item.name}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                        >
                          {active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.description || "No description"} ·{" "}
                        {item.defaultPrice
                          ? `₹${item.defaultPrice.toNumber().toLocaleString("en-IN")}`
                          : "No default price"}
                      </p>
                    </div>
                    {membership.role === "OWNER" && (
                      <div className="flex items-center gap-2">
                        <Link
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          href={`/clinic/${membership.clinicId}/treatments/catalogue?edit=${item.id}`}
                        >
                          Edit
                        </Link>
                        <TreatmentCatalogueStatusForm
                          active={active}
                          clinicId={membership.clinicId}
                          id={item.id}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

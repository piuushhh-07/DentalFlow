import Link from "next/link";
import { ClinicRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError, ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { addClinicGroupBranch, createClinicGroup, dissolveClinicGroup, removeClinicGroupBranch } from "@/features/clinic-groups/actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type BranchesPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: { status?: string };
}>;

const statusMessages: Record<string, string> = {
  created: "Clinic group created. Add another clinic to complete your branch group.",
  "create-error": "We could not create the clinic group. Refresh and try again.",
  "branch-added": "Clinic added to this branch group.",
  "add-error": "We could not add that clinic. Confirm you are an owner of both clinics and try again.",
  "branch-removed": "Clinic removed from the branch group. Its clinic data remains unchanged.",
  "minimum-branches": "A branch group must contain at least two clinics. Dissolve the group to separate all branches.",
  "remove-conflict": "That clinic could not be removed. Refresh and try again.",
  "group-not-found": "This clinic group is no longer available.",
  "keep-current": "Open this page from another branch to remove the current branch.",
  "dissolved": "Branch group dissolved. All clinics remain separate and available.",
  "dissolve-error": "We could not dissolve the group. Refresh and try again.",
  invalid: "Choose a different clinic.",
};

export default async function ClinicBranchesPage({ params, searchParams }: BranchesPageProps) {
  const parsedId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedId.success) notFound();

  let owner;
  try {
    owner = await requireClinicRole(parsedId.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (error instanceof ClinicRoleDeniedError || error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const currentClinic = await prisma.clinic.findFirst({
    where: { id: owner.clinicId },
    select: { id: true, name: true, clinicGroupId: true },
  });
  if (!currentClinic) notFound();

  const group = currentClinic.clinicGroupId
    ? await prisma.clinicGroup.findFirst({
        where: { id: currentClinic.clinicGroupId, ownerUserId: owner.userId },
        include: { clinics: { orderBy: { name: "asc" }, select: { id: true, name: true, address: true, phoneNumber: true } } },
      })
    : null;
  if (currentClinic.clinicGroupId && !group) notFound();

  const availableClinics = group
    ? await prisma.clinic.findMany({
        where: {
          id: { not: currentClinic.id },
          clinicGroupId: null,
          memberships: { some: { userId: owner.userId, role: ClinicRole.OWNER, revokedAt: null } },
        },
        select: { id: true, name: true, address: true },
        orderBy: { name: "asc" },
      })
    : [];

  const status = typeof searchParams.status === "string" ? statusMessages[searchParams.status] : undefined;

  return (
    <AppShell clinicId={owner.clinicId} activeSection="branches">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm font-medium text-teal-700">Clinic settings</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Branches & clinic groups</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Organise clinics you own under one group. Each branch keeps its own patients, appointments, staff, billing, settings and subscription.
          </p>
        </header>

        {status ? <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{status}</p> : null}

        {!group ? (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current clinic</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{currentClinic.name}</h2>
            <p className="mt-2 text-sm text-slate-600">Create a group starting with this clinic. You can then add other clinics where your account has active owner access.</p>
            <form action={createClinicGroup} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input type="hidden" name="clinicId" value={currentClinic.id} />
              <label className="text-sm font-medium text-slate-700">Group name
                <input required name="name" minLength={2} maxLength={120} placeholder="e.g. Kolte Dental Clinics" className="mt-1 block h-11 w-full rounded-md border border-slate-300 px-3 text-sm" />
              </label>
              <button type="submit" className="mt-auto h-11 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800">Create clinic group</button>
            </form>
            <p className="mt-4 text-xs text-slate-500">Creating a group does not combine patient records or financial data.</p>
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Clinic group</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{group.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{group.clinics.length} branches · branch data remains separate</p>
                </div>
                <form action={dissolveClinicGroup}>
                  <input type="hidden" name="clinicId" value={currentClinic.id} />
                  <input type="hidden" name="groupId" value={group.id} />
                  <button type="submit" className="h-9 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50">Dissolve group</button>
                </form>
              </div>
              <ul className="divide-y divide-slate-100">
                {group.clinics.map((clinic) => (
                  <li key={clinic.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{clinic.name}{clinic.id === currentClinic.id ? <span className="ml-2 text-xs font-normal text-teal-700">Current branch</span> : null}</p>
                      <p className="mt-1 text-xs text-slate-500">{clinic.address || "Address not set"}{clinic.phoneNumber ? ` · ${clinic.phoneNumber}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/clinic/${clinic.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open branch</Link>
                      {clinic.id !== currentClinic.id && group.clinics.length > 2 ? (
                        <form action={removeClinicGroupBranch}>
                          <input type="hidden" name="clinicId" value={currentClinic.id} />
                          <input type="hidden" name="groupId" value={group.id} />
                          <input type="hidden" name="targetClinicId" value={clinic.id} />
                          <button type="submit" className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Remove</button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Add an existing clinic</h2>
              <p className="mt-1 text-sm text-slate-600">Only clinics where you have active OWNER access and that are not already in another group are available.</p>
              {availableClinics.length ? (
                <form action={addClinicGroupBranch} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input type="hidden" name="clinicId" value={currentClinic.id} />
                  <input type="hidden" name="groupId" value={group.id} />
                  <label className="text-sm font-medium text-slate-700">Clinic
                    <select name="targetClinicId" required defaultValue="" className="mt-1 block h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                      <option value="" disabled>Select a clinic</option>
                      {availableClinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}{clinic.address ? ` — ${clinic.address}` : ""}</option>)}
                    </select>
                  </label>
                  <button type="submit" className="mt-auto h-11 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800">Add branch</button>
                </form>
              ) : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No other ungrouped clinics with your owner access are available.</p>}
            </section>
          </>
        )}

        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Current release boundary</h2>
          <p className="mt-1 text-sm leading-6 text-amber-800">This release groups and switches between existing clinics only. It does not merge patient identities, share records across branches, consolidate reports or billing, or transfer staff permissions between clinics.</p>
        </aside>
      </div>
    </AppShell>
  );
}

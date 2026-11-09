import { ClinicRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import {
  changeClinicMemberRole,
  removeClinicMember,
} from "@/features/team/actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type ClinicTeamPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: { status?: string };
}>;

const statusMessages: Record<string, string> = {
  updated: "Team member role updated.",
  removed: "Clinic access removed.",
  invalid: "Choose a valid clinic role.",
  "not-found": "That team membership could not be found.",
  "last-owner": "A clinic must always have at least one OWNER.",
  conflict: "The team changed during this request. Refresh and try again.",
  unavailable: "We could not update clinic access. Please try again.",
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});

export default async function ClinicTeamPage({
  params,
  searchParams,
}: ClinicTeamPageProps) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();

  let owner;
  try {
    owner = await requireClinicRole(parsedClinicId.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (error instanceof ClinicRoleDeniedError) notFound();
    throw error;
  }

  const members = await prisma.clinicMembership.findMany({
    where: { clinicId: owner.clinicId },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      user: { select: { displayName: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const status =
    typeof searchParams.status === "string"
      ? statusMessages[searchParams.status]
      : undefined;

  return (
    <AppShell clinicId={owner.clinicId}>
      <main className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm font-medium text-teal-700">Clinic settings</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Team & access
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage the roles and access of people who already belong to this
            clinic. Changes apply to this clinic only.
          </p>
        </header>

        {status && (
          <p
            role="status"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            {status}
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Clinic members</h2>
              <p className="mt-1 text-sm text-slate-500">
                {members.length} {members.length === 1 ? "member" : "members"}
              </p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              Owner access
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {members.map((member) => (
              <li
                key={member.id}
                className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {member.user.displayName?.trim() || "Unnamed team member"}
                    {member.userId === owner.userId && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Joined {dateFormatter.format(member.createdAt)}
                  </p>
                  <span
                    className={
                      member.role === ClinicRole.OWNER
                        ? "mt-2 inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800"
                        : "mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                    }
                  >
                    {member.role}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <form
                    action={changeClinicMemberRole}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="clinicId"
                      value={owner.clinicId}
                    />
                    <input
                      type="hidden"
                      name="membershipId"
                      value={member.id}
                    />
                    <label className="sr-only" htmlFor={`role-${member.id}`}>
                      Role for {member.user.displayName || "team member"}
                    </label>
                    <select
                      id={`role-${member.id}`}
                      name="role"
                      defaultValue={member.role}
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
                    >
                      <option value={ClinicRole.OWNER}>Owner</option>
                      <option value={ClinicRole.STAFF}>Staff</option>
                    </select>
                    <button
                      type="submit"
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Save role
                    </button>
                  </form>

                  <form action={removeClinicMember}>
                    <input
                      type="hidden"
                      name="clinicId"
                      value={owner.clinicId}
                    />
                    <input
                      type="hidden"
                      name="membershipId"
                      value={member.id}
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-md border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Remove access
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Invitations are not enabled yet
          </h2>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            This first release manages existing clinic memberships. Email
            invitations will be added after a secure Supabase Admin invitation
            service and delivery configuration are in place.
          </p>
        </aside>
      </main>
    </AppShell>
  );
}

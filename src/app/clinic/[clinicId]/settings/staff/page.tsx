import Link from "next/link";
import { ClinicRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import {
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { ClinicTeamManager } from "@/features/auth/components/clinic-team-manager";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { listClinicTeam } from "@/features/auth/lib/team-repository";

export const dynamic = "force-dynamic";

export default async function ClinicStaffSettingsPage({
  params,
}: {
  params: { clinicId: string };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

  let owner;
  try {
    owner = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    if (error instanceof ClinicRoleDeniedError) {
      redirect(`/clinic/${clinicId.data}`);
    }
    throw error;
  }
  const team = await listClinicTeam(owner.clinicId);

  return (
    <AppShell activeSection="team" clinicId={owner.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${owner.clinicId}`}
        >
          ← Back to dashboard
        </Link>
        <header className="mb-6 mt-4">
          <p className="text-sm font-medium text-teal-700">Clinic settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Staff access
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Owners can invite or remove staff. Permissions are enforced on
            server actions, not only hidden in the interface.
          </p>
        </header>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <ClinicTeamManager
            clinicId={owner.clinicId}
            invitations={team.invitations}
            members={team.members}
          />
        </section>
      </div>
    </AppShell>
  );
}

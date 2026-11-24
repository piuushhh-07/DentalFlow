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
  const invitationConfigurationMissing =
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SITE_URL;

  return (
    <AppShell activeSection="team" clinicId={owner.clinicId}>
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="text-sm font-medium text-teal-800 hover:underline"
            href={`/clinic/${owner.clinicId}`}
          >
            ← Back to dashboard
          </Link>
          <Link
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/clinic/${owner.clinicId}/settings/profile`}
          >
            Edit clinic profile
          </Link>
          <Link
            className="rounded-md border border-teal-700 bg-white px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50"
            href={`/clinic/${owner.clinicId}/hr/attendance`}
          >
            Staff attendance
          </Link>
        </div>
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
        {invitationConfigurationMissing && (
          <aside
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
            role="status"
          >
            <h2 className="text-sm font-semibold text-amber-900">
              Staff invitations need configuration
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Add SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SITE_URL to this
              deployment's server-side environment variables, then redeploy.
              Keep the service-role key secret and never expose it to the
              browser.
            </p>
          </aside>
        )}
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

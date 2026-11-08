import Link from "next/link";
import { ClinicPermission } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import {
  ClinicAccessDeniedError,
  ClinicPermissionDeniedError,
} from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { DentistProfileForm } from "@/features/team/components/dentist-profile-form";

export const dynamic = "force-dynamic";

export default async function AddDentistPage({
  params,
}: {
  params: { clinicId: string };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();
  let membership;
  try {
    membership = await requireClinicPermission(
      clinicId.data,
      ClinicPermission.STAFF_MANAGE,
    );
  } catch (error) {
    if (
      error instanceof ClinicAccessDeniedError ||
      error instanceof ClinicPermissionDeniedError
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <AppShell activeSection="team" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${membership.clinicId}/team/dentists`}
        >
          Dentist directory
        </Link>
        <h1 className="mb-6 mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Add dentist
        </h1>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <DentistProfileForm clinicId={membership.clinicId} />
        </section>
      </div>
    </AppShell>
  );
}

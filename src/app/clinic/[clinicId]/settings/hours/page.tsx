import Link from "next/link";
import { ClinicRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import {
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { ClinicWorkingHoursForm } from "@/features/clinic-settings/components/clinic-working-hours-form";
import type { ClinicWorkingDay } from "@/features/clinic-settings/working-hours-actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function ClinicWorkingHoursPage({
  params,
}: {
  params: { clinicId: string };
}) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();

  let owner;
  try {
    owner = await requireClinicRole(parsedClinicId.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    if (error instanceof ClinicRoleDeniedError) {
      redirect(`/clinic/${parsedClinicId.data}`);
    }
    throw error;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: owner.clinicId },
    select: { workingHours: true, timeZone: true },
  });
  if (!clinic) notFound();

  const initialHours = Array.isArray(clinic.workingHours)
    ? (clinic.workingHours as ClinicWorkingDay[])
    : [];

  return (
    <AppShell clinicId={owner.clinicId}>
      <div className="mx-auto max-w-5xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${owner.clinicId}/settings/profile`}
        >
          ← Back to clinic profile
        </Link>
        <header className="mb-6 mt-4">
          <p className="text-sm font-medium text-teal-700">Clinic settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Working hours
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Set your regular opening hours, weekly closed days and lunch breaks.
            Times are saved using your clinic timezone ({clinic.timeZone}).
          </p>
        </header>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <ClinicWorkingHoursForm
            clinicId={owner.clinicId}
            initialHours={initialHours}
          />
        </section>
      </div>
    </AppShell>
  );
}

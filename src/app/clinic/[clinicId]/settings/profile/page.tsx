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
import { ClinicProfileForm } from "@/features/clinic-settings/components/clinic-profile-form";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function ClinicProfileSettingsPage({
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
    if (error instanceof ClinicRoleDeniedError)
      redirect(`/clinic/${parsedClinicId.data}`);
    throw error;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: owner.clinicId },
    select: {
      name: true,
      phoneNumber: true,
      contactEmail: true,
      address: true,
      timeZone: true,
    },
  });
  if (!clinic) notFound();

  return (
    <AppShell clinicId={owner.clinicId}>
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
            Clinic profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Keep your clinic&apos;s contact information and timezone up to date.
            These details are used across your workspace.
          </p>
        </header>
        <div className="mb-4 flex justify-end">
          <Link
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/clinic/${owner.clinicId}/settings/hours`}
          >
            Manage working hours
          </Link>
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <ClinicProfileForm clinicId={owner.clinicId} clinic={clinic} />
        </section>
      </div>
    </AppShell>
  );
}

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

export const dynamic = "force-dynamic";

export default async function TeamManagementPage({
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

  const cards = [
    {
      title: "Dentist directory",
      description:
        "Professional profiles, availability, and dentist schedules.",
      href: `/clinic/${membership.clinicId}/team/dentists`,
      action: "Manage dentists",
    },
    {
      title: "Staff directory",
      description:
        "Invite clinic staff, update their roles, and manage access.",
      href: `/clinic/${membership.clinicId}/settings/staff`,
      action: "Manage staff",
    },
  ];

  return (
    <AppShell activeSection="team" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-teal-700">Clinic dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Team management
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Manage dentist professional profiles separately from staff sign-in
          access. All records are scoped to this clinic.
        </p>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <section
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              key={card.title}
            >
              <h2 className="text-lg font-semibold text-slate-900">
                {card.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {card.description}
              </p>
              <Link
                className="mt-5 inline-flex h-10 items-center rounded-md bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
                href={card.href}
              >
                {card.action}
              </Link>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

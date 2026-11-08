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
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function DentistDirectoryPage({
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
  const dentists = await prisma.clinicDentist.findMany({
    where: { clinicId: membership.clinicId },
    orderBy: [{ workingStatus: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      specialization: true,
      qualifications: true,
      workingStatus: true,
      profilePhotoUrl: true,
    },
  });

  return (
    <AppShell activeSection="team" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              className="text-sm font-medium text-teal-800 hover:underline"
              href={`/clinic/${membership.clinicId}/team`}
            >
              Team management
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Dentist directory
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Registration details are clinic-provided and are not verified.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
            href={`/clinic/${membership.clinicId}/team/dentists/new`}
          >
            Add dentist
          </Link>
        </div>
        {dentists.length === 0 ? (
          <section className="mt-7 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <h2 className="font-semibold text-slate-900">
              No dentist profiles yet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Add your own profile for a solo clinic or create one for each
              dentist on your team.
            </p>
            <Link
              className="mt-4 inline-flex text-sm font-semibold text-teal-800 hover:underline"
              href={`/clinic/${membership.clinicId}/team/dentists/new`}
            >
              Create the first dentist profile
            </Link>
          </section>
        ) : (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {dentists.map((dentist) => (
              <li key={dentist.id}>
                <Link
                  className="flex h-full gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300"
                  href={`/clinic/${membership.clinicId}/team/dentists/${dentist.id}`}
                >
                  {dentist.profilePhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="size-14 rounded-full object-cover"
                      src={dentist.profilePhotoUrl}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-14 shrink-0 items-center justify-center rounded-full bg-teal-50 text-lg font-semibold text-teal-800"
                    >
                      {dentist.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">
                      {dentist.name}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {dentist.specialization ??
                        dentist.qualifications ??
                        "Dentist"}
                    </span>
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {dentist.workingStatus.replaceAll("_", " ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

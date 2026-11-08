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
import { dentistAvailabilitySchema } from "@/features/appointments/lib/appointment-validation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function EditDentistPage({
  params,
}: {
  params: { clinicId: string; dentistId: string };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const dentistId = z.string().uuid().safeParse(params.dentistId);
  if (!clinicId.success || !dentistId.success) notFound();
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
  const dentist = await prisma.clinicDentist.findFirst({
    where: { id: dentistId.data, clinicId: membership.clinicId },
  });
  if (!dentist) notFound();
  const availability = dentistAvailabilitySchema.safeParse(
    dentist.weeklyAvailability,
  );

  return (
    <AppShell activeSection="team" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${membership.clinicId}/team/dentists/${dentist.id}`}
        >
          Dentist profile
        </Link>
        <h1 className="mb-6 mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Edit dentist
        </h1>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <DentistProfileForm
            clinicId={membership.clinicId}
            initial={{
              id: dentist.id,
              name: dentist.name,
              profilePhotoUrl: dentist.profilePhotoUrl ?? "",
              email: dentist.email ?? "",
              phoneNumber: dentist.phoneNumber ?? "",
              qualifications: dentist.qualifications ?? "",
              specialization: dentist.specialization ?? "",
              registrationNumber: dentist.registrationNumber ?? "",
              registrationCouncil: dentist.registrationCouncil ?? "",
              yearsExperience: dentist.yearsExperience?.toString() ?? "",
              biography: dentist.biography ?? "",
              consultationFee: dentist.consultationFee?.toString() ?? "",
              workingStatus: dentist.workingStatus,
              weeklyAvailability: availability.success ? availability.data : [],
            }}
          />
        </section>
      </div>
    </AppShell>
  );
}

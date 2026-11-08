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

export default async function DentistProfilePage({
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
  const availability = Array.isArray(dentist.weeklyAvailability)
    ? dentist.weeklyAvailability
    : [];
  const schedule = availability
    .filter(
      (
        day,
      ): day is {
        dayOfWeek: number;
        isWorking: boolean;
        startTime: string;
        endTime: string;
      } =>
        typeof day === "object" &&
        day !== null &&
        "dayOfWeek" in day &&
        "isWorking" in day &&
        "startTime" in day &&
        "endTime" in day,
    )
    .filter((day) => day.isWorking);
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return (
    <AppShell activeSection="team" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${membership.clinicId}/team/dentists`}
        >
          Dentist directory
        </Link>
        <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Dentist profile</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {dentist.name}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {dentist.specialization ?? dentist.qualifications ?? "Dentist"} ·{" "}
              {dentist.workingStatus.replaceAll("_", " ")}
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href={`/clinic/${membership.clinicId}/team/dentists/${dentist.id}/edit`}
          >
            Edit profile
          </Link>
        </header>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ["Email", dentist.email],
            ["Phone", dentist.phoneNumber],
            ["Qualifications", dentist.qualifications],
            ["Specialization", dentist.specialization],
            ["Registration number", dentist.registrationNumber],
            ["Registration council", dentist.registrationCouncil],
            [
              "Experience",
              dentist.yearsExperience === null
                ? null
                : `${dentist.yearsExperience} years`,
            ],
            [
              "Consultation fee",
              dentist.consultationFee === null
                ? null
                : `₹${dentist.consultationFee.toString()}`,
            ],
          ].map(([label, value]) => (
            <div
              className="rounded-lg border border-slate-200 bg-white p-4"
              key={label}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {value ?? "Not provided"}
              </p>
            </div>
          ))}
        </div>
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Weekly availability</h2>
          {schedule.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              No working hours configured.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {schedule.map((day) => (
                <li key={day.dayOfWeek}>
                  {dayNames[day.dayOfWeek]} · {day.startTime}–{day.endTime}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Registration information has not been independently verified.
          </p>
        </section>
        <Link
          className="mt-5 inline-flex h-10 items-center rounded-md bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
          href={`/clinic/${membership.clinicId}/appointments?dentistId=${dentist.id}`}
        >
          View dentist schedule
        </Link>
      </div>
    </AppShell>
  );
}

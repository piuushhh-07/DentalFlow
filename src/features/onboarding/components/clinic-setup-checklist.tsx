import "server-only";

import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Globe2,
  UserPlus,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/db/prisma";

type ClinicSetupChecklistProps = Readonly<{ clinicId: string }>;

export async function ClinicSetupChecklist({
  clinicId,
}: ClinicSetupChecklistProps) {
  const [dentists, chairs, patients, appointments, staff, bookingSettings] =
    await Promise.all([
      prisma.clinicDentist.count({ where: { clinicId, active: true } }),
      prisma.treatmentChair.count({ where: { clinicId, active: true } }),
      prisma.patient.count({ where: { clinicId } }),
      prisma.appointment.count({ where: { clinicId } }),
      prisma.clinicMembership.count({
        where: { clinicId, role: "STAFF", active: true, revokedAt: null },
      }),
      prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { publicBookingEnabled: true },
      }),
    ]);

  const requiredItems = [
    {
      id: "resources",
      title: "Set up dentists and chairs",
      description: "Add at least one active dentist and one treatment chair.",
      href: `/clinic/${clinicId}/appointments`,
      done: dentists > 0 && chairs > 0,
      icon: Users,
    },
    {
      id: "patient",
      title: "Add your first patient",
      description: "Create a patient record to start managing care.",
      href: `/clinic/${clinicId}/patients`,
      done: patients > 0,
      icon: UserPlus,
    },
    {
      id: "appointment",
      title: "Schedule your first appointment",
      description: "Put your clinic schedule into action.",
      href: `/clinic/${clinicId}/appointments`,
      done: appointments > 0,
      icon: CalendarPlus,
    },
  ];
  const completed = requiredItems.filter((item) => item.done).length;
  const allRequiredComplete = completed === requiredItems.length;
  const onlineBookingEnabled = bookingSettings?.publicBookingEnabled ?? false;

  return (
    <section
      aria-labelledby="clinic-setup-heading"
      className="mt-6 rounded-2xl border border-teal-200 bg-gradient-to-br from-white to-teal-50/60 p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
            Getting started
          </p>
          <h2
            id="clinic-setup-heading"
            className="mt-1 text-lg font-semibold text-slate-900"
          >
            Your clinic setup
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Complete these essentials to get your clinic running.
          </p>
        </div>
        <div className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-teal-800 ring-1 ring-teal-100">
          {completed} of {requiredItems.length} complete
        </div>
      </div>

      <div
        aria-label={`${completed} of ${requiredItems.length} setup steps complete`}
        className="mt-4 h-2 overflow-hidden rounded-full bg-teal-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={requiredItems.length}
        aria-valuenow={completed}
      >
        <div
          className="h-full rounded-full bg-teal-700 transition-[width]"
          style={{ width: `${(completed / requiredItems.length) * 100}%` }}
        />
      </div>

      <ul className="mt-4 grid gap-2 md:grid-cols-3">
        {requiredItems.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link
                className="group flex h-full gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                href={item.href}
              >
                <span className="mt-0.5 shrink-0 text-teal-700">
                  {item.done ? (
                    <CheckCircle2 aria-label="Completed" className="size-5" />
                  ) : (
                    <Icon aria-hidden="true" className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                    {item.title}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                    />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {item.done ? "Completed" : item.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-teal-700">
              {onlineBookingEnabled ? (
                <CheckCircle2 aria-label="Enabled" className="size-5" />
              ) : (
                <Globe2 aria-hidden="true" className="size-5" />
              )}
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                Online appointment requests
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Optional
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {onlineBookingEnabled
                  ? "Enabled — patients can request appointments through your public booking page."
                  : "Let patients request appointments online. You can review each request before confirming it."}
              </span>
            </span>
          </div>
          <Link
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/clinic/${clinicId}/appointments`}
          >
            {onlineBookingEnabled ? "Manage booking" : "Set up booking"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-teal-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-slate-600">
          <Users
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-teal-700"
          />
          <span>
            <strong className="font-semibold text-slate-800">
              Team access:
            </strong>{" "}
            {staff > 0
              ? `${staff} active staff member${staff === 1 ? "" : "s"} added`
              : "Optional — invite reception or clinical staff when you are ready."}
          </span>
        </div>
        <Link
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          href={`/clinic/${clinicId}/settings/team`}
        >
          Manage team
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {allRequiredComplete && (
        <p className="mt-3 text-sm font-medium text-teal-800">
          Your clinic is ready to go. You can revisit these sections anytime.
        </p>
      )}
    </section>
  );
}

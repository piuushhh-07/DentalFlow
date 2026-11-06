import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ClinicRole } from "@prisma/client";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { AppointmentForm } from "@/features/appointments/components/appointment-form";
import { AppointmentStatusForm } from "@/features/appointments/components/appointment-status-form";
import { ScheduleResourceForm } from "@/features/appointments/components/schedule-resource-form";
import { AppointmentRequestQueue } from "@/features/appointments/components/appointment-request-queue";
import { PublicBookingSettings } from "@/features/appointments/components/public-booking-settings";
import {
  getPublicBookingSettings,
  listAppointmentRequests,
  listAppointmentPatients,
  listAppointmentResources,
  listAppointmentVisits,
  listClinicAppointments,
} from "@/features/appointments/lib/appointment-repository";
import { getClinicToday } from "@/features/follow-ups/lib/follow-up-validation";
import { toClinicDateInput } from "@/features/treatments/lib/treatment-validation";

export const dynamic = "force-dynamic";

const daySchema = z.string().date();
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const displayDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

export default async function ClinicAppointmentsPage({
  params,
  searchParams,
}: {
  params: { clinicId: string };
  searchParams: {
    date?: string;
    patientId?: string;
    treatmentVisitId?: string;
  };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();
  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }
  const today = getClinicToday();
  const date = daySchema.safeParse(searchParams.date ?? today);
  const selectedDate = date.success ? date.data : today;
  const [
    appointments,
    patients,
    visits,
    resources,
    requests,
    bookingSettings,
  ] = await Promise.all([
    listClinicAppointments(membership.clinicId, selectedDate),
    listAppointmentPatients(membership.clinicId),
    listAppointmentVisits(membership.clinicId),
    listAppointmentResources(membership.clinicId),
    listAppointmentRequests(membership.clinicId),
    getPublicBookingSettings(membership.clinicId),
  ]);
  let prefill:
    | {
        patientId: string;
        patientName: string;
        treatmentVisitId: string;
        visitLabel: string;
        dueDate: string;
      }
    | undefined;
  const hasVisitPrefill =
    searchParams.patientId !== undefined ||
    searchParams.treatmentVisitId !== undefined;
  if (hasVisitPrefill) {
    const requestedPatientId = z
      .string()
      .uuid()
      .safeParse(searchParams.patientId);
    const requestedVisitId = z
      .string()
      .uuid()
      .safeParse(searchParams.treatmentVisitId);
    if (!requestedPatientId.success || !requestedVisitId.success) notFound();

    const patient = patients.find(({ id }) => id === requestedPatientId.data);
    const visit = visits.find(
      ({ id, patientId }) =>
        id === requestedVisitId.data && patientId === requestedPatientId.data,
    );
    if (!patient || !visit) notFound();

    prefill = {
      patientId: patient.id,
      patientName: patient.fullName,
      treatmentVisitId: visit.id,
      visitLabel: `${visit.treatmentPlan.name} · Visit ${visit.visitNumber}`,
      dueDate: toClinicDateInput(visit.dueDate),
    };
  }
  const basePath = `/clinic/${membership.clinicId}/appointments`;

  return (
    <AppShell activeSection="appointments" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${membership.clinicId}`}
        >
          ← Back to dashboard
        </Link>
        <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Clinic schedule</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Appointments
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Appointments are stored in this clinic&apos;s database and shown
              in Asia/Kolkata time.
            </p>
          </div>
          <form action={basePath} className="flex items-end gap-2">
            <label className="text-sm font-medium text-slate-700">
              Schedule date
              <input
                className="mt-1 block h-10 rounded-md border border-slate-300 bg-white px-3"
                defaultValue={selectedDate}
                name="date"
                type="date"
              />
            </label>
            <button
              className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50"
              type="submit"
            >
              View
            </button>
          </form>
        </header>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Online booking
          </h2>
          {membership.role === ClinicRole.OWNER && bookingSettings && (
            <PublicBookingSettings
              clinicId={membership.clinicId}
              enabled={bookingSettings.publicBookingEnabled}
              slug={bookingSettings.publicBookingSlug}
            />
          )}
          {membership.role !== ClinicRole.OWNER && (
            <p className="mb-3 text-sm text-slate-600">
              Patients can request a time online. Review requests here; they
              are not confirmed automatically.
            </p>
          )}
          <div className="mt-4">
            <AppointmentRequestQueue
              clinicId={membership.clinicId}
              requests={requests}
            />
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {membership.role === ClinicRole.OWNER && (
            <div className="mb-6 border-b border-slate-100 pb-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Schedule resources
              </h2>
              <ScheduleResourceForm clinicId={membership.clinicId} />
            </div>
          )}
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Create appointment
          </h2>
          {patients.length === 0 ? (
            <p className="text-sm text-slate-600">
              Add a patient before scheduling an appointment.{" "}
              <Link
                className="font-medium text-teal-800 underline"
                href={`/clinic/${membership.clinicId}/patients/new`}
              >
                Create patient
              </Link>
            </p>
          ) : resources.dentists.length === 0 || resources.chairs.length === 0 ? (
            <p className="text-sm text-slate-600">
              Add at least one active dentist and chair before scheduling.
            </p>
          ) : (
            <AppointmentForm
              chairs={resources.chairs}
              clinicId={membership.clinicId}
              dentists={resources.dentists}
              patients={patients}
              prefill={prefill}
              visits={visits}
            />
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-slate-900">
            {displayDateFormatter.format(
              new Date(`${selectedDate}T00:00:00.000Z`),
            )}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {appointments.length} appointment
            {appointments.length === 1 ? "" : "s"}
          </p>
          {appointments.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <h3 className="font-semibold text-slate-900">
                No appointments scheduled
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Appointments created for this date will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {appointments.map((appointment) => {
                const editForm = {
                  appointmentId: appointment.id,
                  patientId: appointment.patientId,
                  treatmentVisitId: appointment.treatmentVisitId,
                  date: dateFormatter.format(appointment.scheduledAt),
                  time: timeFormatter.format(appointment.scheduledAt),
                  durationMinutes: appointment.durationMinutes,
                  dentistId: appointment.dentistId,
                  chairId: appointment.chairId,
                  type: appointment.type,
                  notes: appointment.notes,
                };
                return (
                  <article
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                    key={appointment.id}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-teal-800">
                          {timeFormatter.format(appointment.scheduledAt)} ·{" "}
                          {appointment.durationMinutes} min ·{" "}
                          {appointment.status.replaceAll("_", " ")}
                        </p>
                        <Link
                          className="mt-1 inline-block text-lg font-semibold text-slate-900 hover:text-teal-800"
                          href={`/clinic/${membership.clinicId}/patients/${appointment.patient.id}`}
                        >
                          {appointment.patient.fullName}
                        </Link>
                        <p className="mt-1 text-sm text-slate-600">
                          {appointment.type} · {appointment.dentistName} ·{" "}
                          {appointment.chairLabel}
                        </p>
                        {appointment.treatmentVisit && (
                          <p className="mt-1 text-sm text-slate-600">
                            Linked to{" "}
                            {appointment.treatmentVisit.treatmentPlan.name},
                            visit {appointment.treatmentVisit.visitNumber}
                          </p>
                        )}
                        {appointment.treatmentVisit && (
                          <p className="mt-1 text-xs text-slate-500">
                            Treatment visit status:{" "}
                            {appointment.treatmentVisit.status.replaceAll(
                              "_",
                              " ",
                            )}{" "}
                            · managed separately
                          </p>
                        )}
                        {appointment.notes && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                            {appointment.notes}
                          </p>
                        )}
                      </div>
                      <AppointmentStatusForm
                        clinicId={membership.clinicId}
                        appointmentId={appointment.id}
                        status={appointment.status}
                      />
                    </div>
                    {!["COMPLETED", "CANCELLED"].includes(
                      appointment.status,
                    ) && (
                      <details className="mt-4 border-t border-slate-100 pt-3">
                        <summary className="cursor-pointer text-sm font-medium text-teal-800">
                          Edit appointment
                        </summary>
                        <div className="mt-4">
                          <AppointmentForm
                            chairs={resources.chairs}
                            clinicId={membership.clinicId}
                            dentists={resources.dentists}
                            initial={editForm}
                            patients={patients}
                            visits={visits}
                          />
                        </div>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

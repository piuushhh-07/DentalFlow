import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ClinicRole } from "@prisma/client";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { AppointmentCalendar } from "@/features/appointments/components/appointment-calendar";
import { ScheduleResourceForm } from "@/features/appointments/components/schedule-resource-form";
import { AppointmentRequestQueue } from "@/features/appointments/components/appointment-request-queue";
import { PublicBookingSettings } from "@/features/appointments/components/public-booking-settings";
import {
  getPublicBookingSettings,
  listAppointmentRequests,
  listAppointmentPatients,
  listAppointmentResources,
  listAppointmentVisits,
  listClinicAppointmentsInRange,
  listScheduleResources,
} from "@/features/appointments/lib/appointment-repository";
import {
  getAppointmentCalendarRange,
  type AppointmentCalendarView,
} from "@/features/appointments/lib/appointment-calendar";
import { getClinicToday } from "@/features/follow-ups/lib/follow-up-validation";
import { toClinicDateInput } from "@/features/treatments/lib/treatment-validation";

export const dynamic = "force-dynamic";

const daySchema = z.string().date();
const viewSchema = z.enum(["month", "week", "day"]);

export default async function ClinicAppointmentsPage({
  params,
  searchParams,
}: {
  params: { clinicId: string };
  searchParams: {
    date?: string;
    view?: string;
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
  const parsedView = viewSchema.safeParse(searchParams.view ?? "week");
  const selectedView: AppointmentCalendarView = parsedView.success
    ? parsedView.data
    : "week";
  const appointmentRange = getAppointmentCalendarRange(
    selectedDate,
    selectedView,
  );
  const [
    appointments,
    patients,
    visits,
    resources,
    requests,
    bookingSettings,
    scheduleResources,
  ] = await Promise.all([
    listClinicAppointmentsInRange(
      membership.clinicId,
      appointmentRange.startDate,
      appointmentRange.endDate,
    ),
    listAppointmentPatients(membership.clinicId),
    listAppointmentVisits(membership.clinicId),
    listAppointmentResources(membership.clinicId),
    listAppointmentRequests(membership.clinicId),
    getPublicBookingSettings(membership.clinicId),
    membership.role === ClinicRole.OWNER
      ? listScheduleResources(membership.clinicId)
      : Promise.resolve({ dentists: [], chairs: [] }),
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
  return (
    <AppShell activeSection="appointments" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${membership.clinicId}`}
        >
          ← Back to dashboard
        </Link>
        <header className="mt-4">
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
        </header>

        <div className="mt-6">
          <AppointmentCalendar
            appointments={appointments.map((appointment) => ({
              id: appointment.id,
              patientId: appointment.patientId,
              treatmentVisitId: appointment.treatmentVisitId,
              scheduledAt: appointment.scheduledAt.toISOString(),
              durationMinutes: appointment.durationMinutes,
              dentistId: appointment.dentistId,
              chairId: appointment.chairId,
              dentistName: appointment.dentistName,
              chairLabel: appointment.chairLabel,
              type: appointment.type,
              status: appointment.status,
              notes: appointment.notes,
              patient: {
                id: appointment.patient.id,
                fullName: appointment.patient.fullName,
              },
              treatmentVisit: appointment.treatmentVisit
                ? {
                    visitNumber: appointment.treatmentVisit.visitNumber,
                    status: appointment.treatmentVisit.status,
                    treatmentPlan: {
                      name: appointment.treatmentVisit.treatmentPlan.name,
                    },
                  }
                : null,
            }))}
            chairs={resources.chairs}
            clinicId={membership.clinicId}
            date={selectedDate}
            dentists={resources.dentists}
            patients={patients}
            prefill={prefill}
            view={selectedView}
            visits={visits}
          />
        </div>

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
              Patients can request a time online. Review requests here; they are
              not confirmed automatically.
            </p>
          )}
          <div className="mt-4">
            <AppointmentRequestQueue
              clinicId={membership.clinicId}
              requests={requests}
            />
          </div>
        </section>

        {membership.role === ClinicRole.OWNER && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Schedule resources
            </h2>
            <ScheduleResourceForm
              chairs={scheduleResources.chairs}
              clinicId={membership.clinicId}
              dentists={scheduleResources.dentists}
            />
            <hr className="my-5 border-slate-100" />
          </section>
        )}
      </div>
    </AppShell>
  );
}

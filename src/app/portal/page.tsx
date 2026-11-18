import { signOutPatientPortal } from "@/features/patients/actions";
import { PatientPortalSignInForm } from "@/features/patients/components/patient-portal-sign-in-form";
import { listPatientPortalRecords } from "@/features/patients/lib/patient-portal-repository";
import {
  isExpectedUnauthenticatedAuthError,
  resolveAuthenticatedUser,
} from "@/features/auth/lib/auth-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PatientPortalPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.auth.getUser().catch((error: unknown) => {
    if (isExpectedUnauthenticatedAuthError(error)) {
      return { data: { user: null }, error: null };
    }
    throw new Error("Unable to verify the patient portal session.", {
      cause: error,
    });
  });
  const user = resolveAuthenticatedUser(result.data.user, result.error);
  const email = user?.email?.toLowerCase();
  const isVerified = Boolean(user?.email_confirmed_at && email);
  const patients =
    isVerified && email ? await listPatientPortalRecords(email) : [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-sm font-semibold text-teal-800">DentalFlow</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Patient portal
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in with the email address your clinic has enabled for portal
            access.
          </p>
        </header>

        {!isVerified ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {searchParams.error === "verification" && (
              <p className="mb-4 text-sm text-red-700" role="alert">
                This sign-in link could not be verified. Request a new link and
                try again.
              </p>
            )}
            <PatientPortalSignInForm />
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Access is available only when your clinic has enabled the portal
              for your patient record. For urgent matters, contact your clinic
              directly.
            </p>
          </section>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="break-all text-sm text-slate-600">
                Signed in as {email}
              </p>
              <form action={signOutPatientPortal}>
                <button
                  className="h-9 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
            {patients.length === 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  No portal records found
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Contact your clinic and ask them to verify your email address
                  and enable portal access.
                </p>
              </section>
            ) : (
              <div className="space-y-5">
                {patients.map((patient) => (
                  <section
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                    key={patient.id}
                  >
                    <h2 className="text-xl font-semibold text-slate-900">
                      {patient.fullName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {patient.clinic.name}
                      {patient.clinic.phoneNumber
                        ? ` · ${patient.clinic.phoneNumber}`
                        : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {patient.clinic.publicBookingEnabled && (
                        <a
                          className="inline-flex min-h-10 items-center rounded-md bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
                          href={`/book/${patient.clinic.publicBookingSlug}`}
                        >
                          Request an appointment
                        </a>
                      )}
                      {patient.clinic.phoneNumber && (
                        <a
                          className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          href={`tel:${patient.clinic.phoneNumber}`}
                        >
                          Call clinic
                        </a>
                      )}
                    </div>
                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          Upcoming appointments
                        </h3>
                        {patient.appointments.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500">
                            No upcoming appointments.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {patient.appointments.map((appointment, index) => (
                              <li
                                className="rounded-lg bg-slate-50 p-3 text-sm"
                                key={`${appointment.scheduledAt.toISOString()}-${index}`}
                              >
                                <p className="font-medium text-slate-900">
                                  {appointment.type}
                                </p>
                                <p className="mt-1 text-slate-600">
                                  {new Intl.DateTimeFormat("en-IN", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                    timeZone: "Asia/Kolkata",
                                  }).format(appointment.scheduledAt)}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {appointment.status.replaceAll("_", " ")}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          Treatment estimates
                        </h3>
                        {patient.treatmentEstimates.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500">
                            No estimates are currently shared with you.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {patient.treatmentEstimates.map(
                              (estimate, index) => (
                                <li
                                  className="rounded-lg bg-slate-50 p-3 text-sm"
                                  key={`${estimate.estimateDate.toISOString()}-${index}`}
                                >
                                  <p className="font-medium text-slate-900">
                                    {estimate.currency}{" "}
                                    {Number(estimate.totalAmount).toLocaleString(
                                      "en-IN",
                                      { minimumFractionDigits: 2 },
                                    )}
                                  </p>
                                  <p className="mt-1 text-slate-600">
                                    Valid through{" "}
                                    {new Intl.DateTimeFormat("en-IN", {
                                      dateStyle: "medium",
                                      timeZone: "Asia/Kolkata",
                                    }).format(estimate.validityDate)}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {estimate.status.toLowerCase()}
                                  </p>
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="mt-7 border-t border-slate-100 pt-6">
                      <h3 className="font-semibold text-slate-900">
                        Treatment history
                      </h3>
                      {patient.treatmentPlans.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">
                          No treatment plans are available yet.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-3">
                          {patient.treatmentPlans.map((plan, index) => {
                            const completedVisits = plan.visits.filter(
                              (visit) => visit.status === "COMPLETED",
                            ).length;
                            return (
                              <li
                                className="rounded-lg border border-slate-100 bg-slate-50 p-4"
                                key={`${plan.name}-${plan.createdAt.toISOString()}-${index}`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-slate-900">
                                      {plan.name}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {plan.type.replaceAll("_", " ")}
                                    </p>
                                  </div>
                                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                                    {plan.status.toLowerCase()}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-600">
                                  {completedVisits} of {plan.totalVisits} visits
                                  completed
                                </p>
                                {plan.visits.length > 0 && (
                                  <ol className="mt-3 space-y-2 border-l-2 border-teal-100 pl-3">
                                    {plan.visits.map((visit) => (
                                      <li
                                        className="text-xs text-slate-600"
                                        key={visit.visitNumber}
                                      >
                                        Visit {visit.visitNumber} ·{" "}
                                        {visit.status.replaceAll("_", " ").toLowerCase()}
                                        {visit.completedAt
                                          ? ` · Completed ${new Intl.DateTimeFormat("en-IN", {
                                              dateStyle: "medium",
                                              timeZone: "Asia/Kolkata",
                                            }).format(visit.completedAt)}`
                                          : ""}
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="mt-7 border-t border-slate-100 pt-6">
                      <h3 className="font-semibold text-slate-900">
                        Prescriptions
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Finalized prescriptions shared by your clinic.
                      </p>
                      {patient.digitalPrescriptions.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">
                          No finalized prescriptions are available.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-3">
                          {patient.digitalPrescriptions.map((prescription, index) => (
                            <li
                              className="rounded-lg border border-slate-100 p-4"
                              key={`${prescription.prescriptionDate.toISOString()}-${index}`}
                            >
                              <div className="flex flex-wrap justify-between gap-2">
                                <p className="font-medium text-slate-900">
                                  {new Intl.DateTimeFormat("en-IN", {
                                    dateStyle: "medium",
                                    timeZone: "Asia/Kolkata",
                                  }).format(prescription.prescriptionDate)}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {prescription.authorNameSnapshot}
                                  {prescription.authorRegistrationSnapshot
                                    ? ` · Reg. ${prescription.authorRegistrationSnapshot}`
                                    : ""}
                                </p>
                              </div>
                              {prescription.diagnosisNotes && (
                                <p className="mt-3 text-sm text-slate-700">
                                  <span className="font-medium">Diagnosis: </span>
                                  {prescription.diagnosisNotes}
                                </p>
                              )}
                              {prescription.medicines.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                  {prescription.medicines.map((medicine, medicineIndex) => (
                                    <li
                                      className="rounded-md bg-slate-50 p-3 text-sm"
                                      key={`${medicine.medicineName}-${medicineIndex}`}
                                    >
                                      <p className="font-semibold text-slate-900">
                                        {medicine.medicineName}
                                      </p>
                                      <p className="mt-1 text-slate-700">
                                        {medicine.dosage} · {medicine.route} · {medicine.frequency}
                                      </p>
                                      <p className="mt-1 text-slate-600">
                                        {medicine.duration} · Quantity: {medicine.quantity}
                                      </p>
                                      {medicine.instructions && (
                                        <p className="mt-1 text-slate-600">
                                          {medicine.instructions}
                                        </p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {prescription.additionalAdvice && (
                                <p className="mt-3 text-sm text-slate-700">
                                  <span className="font-medium">Advice: </span>
                                  {prescription.additionalAdvice}
                                </p>
                              )}
                              {prescription.followUpDate && (
                                <p className="mt-2 text-sm text-teal-800">
                                  Follow-up:{" "}
                                  {new Intl.DateTimeFormat("en-IN", {
                                    dateStyle: "medium",
                                    timeZone: "Asia/Kolkata",
                                  }).format(prescription.followUpDate)}
                                </p>
                              )}
                              <p className="mt-3 text-xs text-slate-500">
                                {prescription.clinicNameSnapshot}
                                {prescription.clinicPhoneSnapshot
                                  ? ` · ${prescription.clinicPhoneSnapshot}`
                                  : ""}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

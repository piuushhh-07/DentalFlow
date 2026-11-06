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

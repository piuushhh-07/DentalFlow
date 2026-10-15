import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/lib/server-auth";
import { clinicLandingPath } from "@/features/onboarding/lib/onboarding";
import { getUserClinicMemberships } from "@/features/onboarding/lib/user-clinics";

export default async function ClinicsPage() {
  const user = await getAuthenticatedUser();
  const memberships = await getUserClinicMemberships(user.id);

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  if (memberships.length === 1) {
    redirect(clinicLandingPath(memberships));
  }

  return (
    <main className="min-h-svh bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-medium text-teal-700">DentalFlow</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Choose a clinic
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Select a clinic where your account already has an active membership.
        </p>
        <ul className="mt-7 space-y-3">
          {memberships.map((membership) => (
            <li key={membership.clinicId}>
              <Link
                className="flex min-h-16 items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/clinic/${membership.clinicId}`}
              >
                <span className="font-semibold text-slate-900">
                  {membership.clinicName}
                </span>
                <span className="text-sm font-medium text-teal-700">
                  Open clinic
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

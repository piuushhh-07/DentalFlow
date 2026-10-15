import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/lib/server-auth";
import { clinicLandingPath } from "@/features/onboarding/lib/onboarding";
import { getUserClinicMemberships } from "@/features/onboarding/lib/user-clinics";

export default async function Home() {
  const user = await getAuthenticatedUser();
  const memberships = await getUserClinicMemberships(user.id);

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  redirect(clinicLandingPath(memberships));
}

import "server-only";

import { ClinicRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { measureServerOperation } from "@/lib/performance/server-timing";

import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isExpectedUnauthenticatedAuthError,
  resolveAuthenticatedUser,
} from "@/features/auth/lib/auth-session";
import {
  authorizeClinicMembership,
  authorizeClinicRole,
  type VerifiedClinicMembership,
} from "@/features/auth/lib/authorization";

const clinicIdSchema = z.string().uuid();

export const getAuthenticatedUser = cache(async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();

  const result = await measureServerOperation("auth.supabase.get_user", () =>
    supabase.auth.getUser().catch((error: unknown) => {
    if (isExpectedUnauthenticatedAuthError(error)) {
      redirect("/login");
    }

    throw new Error("Unable to verify the Supabase session.", {
      cause: error,
    });
  }),
  );

  const user = resolveAuthenticatedUser(result.data.user, result.error);

  if (!user) {
    redirect("/login");
  }

  return user;
});

export const requireClinicMembership = cache(async function requireClinicMembership(
  requestedClinicId: string,
): Promise<VerifiedClinicMembership> {
  const parsedClinicId = clinicIdSchema.safeParse(requestedClinicId);

  if (!parsedClinicId.success) {
    throw new Error("A valid clinic selection is required.");
  }

  const user = await getAuthenticatedUser();
  const membership = await measureServerOperation("auth.clinic_membership", () =>
    prisma.clinicMembership.findFirst({
    where: {
      userId: user.id,
      clinicId: parsedClinicId.data,
      revokedAt: null,
    },
    select: {
      userId: true,
      clinicId: true,
      role: true,
      revokedAt: true,
    },
  }),
  );

  return authorizeClinicMembership(user.id, parsedClinicId.data, membership);
});

export async function requireClinicRole(
  requestedClinicId: string,
  allowedRoles: readonly ClinicRole[],
): Promise<VerifiedClinicMembership> {
  return authorizeClinicRole(
    await requireClinicMembership(requestedClinicId),
    allowedRoles,
  );
}

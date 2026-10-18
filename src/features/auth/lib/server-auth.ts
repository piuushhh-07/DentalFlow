import "server-only";

import { ClinicRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

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

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();

  const result = await supabase.auth.getUser().catch((error: unknown) => {
    if (isExpectedUnauthenticatedAuthError(error)) {
      redirect("/login");
    }

    throw new Error("Unable to verify the Supabase session.", {
      cause: error,
    });
  });

  const user = resolveAuthenticatedUser(result.data.user, result.error);

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireClinicMembership(
  requestedClinicId: string,
): Promise<VerifiedClinicMembership> {
  const parsedClinicId = clinicIdSchema.safeParse(requestedClinicId);

  if (!parsedClinicId.success) {
    throw new Error("A valid clinic selection is required.");
  }

  const user = await getAuthenticatedUser();
  const membership = await prisma.clinicMembership.findUnique({
    where: {
      userId_clinicId: {
        userId: user.id,
        clinicId: parsedClinicId.data,
      },
    },
    select: {
      userId: true,
      clinicId: true,
      role: true,
    },
  });

  return authorizeClinicMembership(user.id, parsedClinicId.data, membership);
}

export async function requireClinicRole(
  requestedClinicId: string,
  allowedRoles: readonly ClinicRole[],
): Promise<VerifiedClinicMembership> {
  return authorizeClinicRole(
    await requireClinicMembership(requestedClinicId),
    allowedRoles,
  );
}

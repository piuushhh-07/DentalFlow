"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { validateMembershipMutation } from "@/features/team/lib/team-management";
import { prisma } from "@/lib/db/prisma";

type TeamActionStatus =
  | "updated"
  | "removed"
  | "invalid"
  | "not-found"
  | "last-owner"
  | "conflict"
  | "unavailable";

function teamPath(clinicId: string, status: TeamActionStatus): string {
  return `/clinic/${clinicId}/settings/team?status=${status}`;
}

function parseUuid(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuid.test(value) ? value : null;
}

async function mutateMembership(
  formData: FormData,
  kind: "change-role" | "remove",
): Promise<never> {
  const clinicId = parseUuid(formData.get("clinicId"));
  const membershipId = parseUuid(formData.get("membershipId"));
  const requestedRole = formData.get("role");

  if (!clinicId || !membershipId) {
    redirect("/clinics");
  }

  const actor = await requireClinicRole(clinicId, [ClinicRole.OWNER]);

  if (
    kind === "change-role" &&
    requestedRole !== ClinicRole.OWNER &&
    requestedRole !== ClinicRole.STAFF
  ) {
    redirect(teamPath(clinicId, "invalid"));
  }

  let status: TeamActionStatus = "unavailable";

  try {
    status = await prisma.$transaction(
      async (transaction) => {
        const actorMembership = await transaction.clinicMembership.findUnique({
          where: {
            userId_clinicId: {
              userId: actor.userId,
              clinicId,
            },
          },
          select: { role: true },
        });

        if (actorMembership?.role !== ClinicRole.OWNER) {
          return "unavailable";
        }

        const target = await transaction.clinicMembership.findFirst({
          where: { id: membershipId, clinicId },
          select: { id: true, role: true },
        });

        if (!target) return "not-found";

        const ownerCount = await transaction.clinicMembership.count({
          where: { clinicId, role: ClinicRole.OWNER },
        });

        const invariantError = validateMembershipMutation(
          kind === "remove"
            ? {
                kind,
                currentRole: target.role,
                ownerCount,
              }
            : {
                kind,
                currentRole: target.role,
                nextRole: requestedRole as ClinicRole,
                ownerCount,
              },
        );

        if (invariantError === "LAST_OWNER") return "last-owner";
        if (invariantError) return "unavailable";

        if (kind === "remove") {
          const result = await transaction.clinicMembership.deleteMany({
            where: { id: target.id, clinicId, role: target.role },
          });
          return result.count === 1 ? "removed" : "conflict";
        }

        const result = await transaction.clinicMembership.updateMany({
          where: { id: target.id, clinicId, role: target.role },
          data: { role: requestedRole as ClinicRole },
        });
        return result.count === 1 ? "updated" : "conflict";
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      status = "conflict";
    } else {
      console.error("Clinic team membership mutation failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        code:
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : "none",
      });
    }
  }

  revalidatePath(`/clinic/${clinicId}/settings/team`);
  redirect(teamPath(clinicId, status));
}

export async function changeClinicMemberRole(
  formData: FormData,
): Promise<never> {
  return mutateMembership(formData, "change-role");
}

export async function removeClinicMember(
  formData: FormData,
): Promise<never> {
  return mutateMembership(formData, "remove");
}

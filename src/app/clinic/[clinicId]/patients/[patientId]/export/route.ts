import { ClinicRole, Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { exportClinicPatientData } from "@/features/patients/lib/patient-export-repository";

export async function GET(
  _request: NextRequest,
  { params }: { params: { clinicId: string; patientId: string } },
) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);
  if (!clinicId.success || !patientId.success) {
    return NextResponse.json({ error: "Patient record not found." }, { status: 404 });
  }

  try {
    const membership = await requireClinicRole(clinicId.data, [
      ClinicRole.OWNER,
    ]);
    const exported = await exportClinicPatientData(
      membership.clinicId,
      patientId.data,
      membership.userId,
    );
    if (!exported) {
      return NextResponse.json(
        { error: "Patient record not found." },
        { status: 404 },
      );
    }

    return new Response(JSON.stringify(exported, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dentalflow-patient-${patientId.data}-export.json"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) {
      return NextResponse.json({ error: "Patient record not found." }, { status: 404 });
    }
    if (error instanceof ClinicRoleDeniedError) {
      return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Patient data export failed.", { code: error.code });
    } else {
      console.error("Patient data export failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return NextResponse.json(
      { error: "The patient export could not be completed." },
      { status: 500 },
    );
  }
}

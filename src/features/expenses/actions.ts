"use server";

import { ClinicRole, PaymentMethod, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";

const expenseSchema = z.object({
  clinicId: z.string().uuid(),
  description: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(80),
  vendor: z.string().trim().max(160).optional(),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.nativeEnum(PaymentMethod),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

function expensePath(clinicId: string, status: string): string {
  return `/clinic/${clinicId}/expenses?status=${status}`;
}

export async function createClinicExpense(formData: FormData): Promise<never> {
  const parsed = expenseSchema.safeParse({
    clinicId: formData.get("clinicId"),
    description: formData.get("description"),
    category: formData.get("category"),
    vendor: formData.get("vendor") ?? "",
    amount: formData.get("amount"),
    expenseDate: formData.get("expenseDate"),
    paymentMethod: formData.get("paymentMethod"),
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");

  const membership = await requireClinicRole(parsed.data.clinicId, [
    ClinicRole.OWNER,
  ]);
  try {
    await prisma.clinicExpense.create({
      data: {
        clinicId: membership.clinicId,
        recordedByUserId: membership.userId,
        description: parsed.data.description,
        category: parsed.data.category,
        vendor: parsed.data.vendor || null,
        amount: new Prisma.Decimal(parsed.data.amount),
        expenseDate: new Date(`${parsed.data.expenseDate}T00:00:00.000Z`),
        paymentMethod: parsed.data.paymentMethod,
        reference: parsed.data.reference || null,
        notes: parsed.data.notes || null,
      },
    });
  } catch (error) {
    console.error("Clinic expense creation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    redirect(expensePath(membership.clinicId, "error"));
  }

  revalidatePath(`/clinic/${membership.clinicId}/expenses`);
  revalidatePath(`/clinic/${membership.clinicId}/reports`);
  redirect(expensePath(membership.clinicId, "created"));
}

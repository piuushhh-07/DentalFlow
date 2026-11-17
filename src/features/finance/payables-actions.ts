"use server";

import { ClinicRole, PaymentMethod, Prisma, VendorBillStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import {
  assertFeatureEnabled,
  BillingAccessRestrictedError,
  BillingFeatureUnavailableError,
} from "@/features/billing/lib/billing-entitlements";
import { prisma } from "@/lib/db/prisma";

const billSchema = z.object({
  clinicId: z.string().uuid(),
  vendorName: z.string().trim().min(2).max(160),
  invoiceNumber: z.string().trim().max(80).optional(),
  description: z.string().trim().min(2).max(300),
  category: z.string().trim().min(2).max(80),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  notes: z.string().trim().max(1000).optional(),
}).refine((value) => value.dueDate >= value.billDate, {
  message: "Due date cannot be before the bill date.",
  path: ["dueDate"],
});

const paymentSchema = z.object({
  clinicId: z.string().uuid(),
  billId: z.string().uuid(),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  paymentMethod: z.nativeEnum(PaymentMethod),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

function financePath(clinicId: string, status: string): string {
  return `/clinic/${clinicId}/finance/payables?status=${status}`;
}

async function requireFinanceOwner(clinicId: string) {
  const membership = await requireClinicRole(clinicId, [ClinicRole.OWNER]);
  await assertFeatureEnabled(prisma, membership.clinicId, "expenseManagement");
  return membership;
}

export async function createVendorBill(formData: FormData): Promise<never> {
  const parsed = billSchema.safeParse({
    clinicId: formData.get("clinicId"),
    vendorName: formData.get("vendorName"),
    invoiceNumber: formData.get("invoiceNumber") ?? "",
    description: formData.get("description"),
    category: formData.get("category"),
    billDate: formData.get("billDate"),
    dueDate: formData.get("dueDate"),
    amount: formData.get("amount"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "expenseManagement");
      await tx.vendorBill.create({
        data: {
          clinicId: membership.clinicId,
          recordedByUserId: membership.userId,
          vendorName: parsed.data.vendorName,
          invoiceNumber: parsed.data.invoiceNumber || null,
          description: parsed.data.description,
          category: parsed.data.category,
          billDate: new Date(`${parsed.data.billDate}T00:00:00.000Z`),
          dueDate: new Date(`${parsed.data.dueDate}T00:00:00.000Z`),
          amount: new Prisma.Decimal(parsed.data.amount),
          notes: parsed.data.notes || null,
        },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) redirect(financePath(membership.clinicId, "upgrade-required"));
    if (error instanceof BillingAccessRestrictedError) redirect(financePath(membership.clinicId, "subscription-restricted"));
    console.error("Vendor bill creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(financePath(membership.clinicId, "error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/finance/payables`);
  redirect(financePath(membership.clinicId, "created"));
}

export async function recordVendorBillPayment(formData: FormData): Promise<never> {
  const parsed = paymentSchema.safeParse({
    clinicId: formData.get("clinicId"),
    billId: formData.get("billId"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    paidAt: formData.get("paidAt"),
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "expenseManagement");
      const lockKey = `vendor-bill-payment:${membership.clinicId}:${parsed.data.billId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const bill = await tx.vendorBill.findFirst({
        where: { id: parsed.data.billId, clinicId: membership.clinicId, status: { not: VendorBillStatus.VOID } },
        select: { id: true, amount: true },
      });
      if (!bill) throw new Error("VENDOR_BILL_NOT_FOUND");
      const paid = await tx.vendorBillPayment.aggregate({
        where: { billId: bill.id, clinicId: membership.clinicId },
        _sum: { amount: true },
      });
      const alreadyPaid = paid._sum.amount ?? new Prisma.Decimal(0);
      const paymentAmount = new Prisma.Decimal(parsed.data.amount);
      if (alreadyPaid.plus(paymentAmount).greaterThan(bill.amount)) throw new Error("VENDOR_BILL_OVERPAYMENT");
      await tx.vendorBillPayment.create({
        data: {
          clinicId: membership.clinicId,
          billId: bill.id,
          recordedByUserId: membership.userId,
          amount: paymentAmount,
          paymentMethod: parsed.data.paymentMethod,
          paidAt: new Date(`${parsed.data.paidAt}T12:00:00.000Z`),
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
        },
      });
      const newPaid = alreadyPaid.plus(paymentAmount);
      await tx.vendorBill.update({
        where: { id: bill.id },
        data: { status: newPaid.equals(bill.amount) ? VendorBillStatus.PAID : VendorBillStatus.PARTIALLY_PAID },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) redirect(financePath(membership.clinicId, "upgrade-required"));
    if (error instanceof BillingAccessRestrictedError) redirect(financePath(membership.clinicId, "subscription-restricted"));
    if (error instanceof Error && error.message === "VENDOR_BILL_OVERPAYMENT") redirect(financePath(membership.clinicId, "overpayment"));
    console.error("Vendor bill payment failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(financePath(membership.clinicId, "payment-error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/finance/payables`);
  revalidatePath(`/clinic/${membership.clinicId}/expenses`);
  redirect(financePath(membership.clinicId, "payment-recorded"));
}

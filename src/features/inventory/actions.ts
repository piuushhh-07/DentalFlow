"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";

const uuidSchema = z.string().uuid();
const itemSchema = z.object({
  clinicId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().max(100).optional(),
  sku: z.string().trim().max(80).optional(),
  unit: z.string().trim().min(1).max(24),
  reorderLevel: z.coerce.number().finite().min(0).max(1_000_000),
  unitCost: z
    .union([
      z.literal(""),
      z.coerce.number().finite().min(0).max(1_000_000_000),
    ])
    .optional(),
});
const movementSchema = z.object({
  clinicId: uuidSchema,
  itemId: uuidSchema,
  type: z.enum(["STOCK_IN", "STOCK_OUT"]),
  quantity: z.coerce.number().finite().positive().max(1_000_000),
  unitCost: z
    .union([
      z.literal(""),
      z.coerce.number().finite().min(0).max(1_000_000_000),
    ])
    .optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

function inventoryPath(clinicId: string, status: string): string {
  return `/clinic/${clinicId}/inventory?status=${status}`;
}

export async function createInventoryItem(formData: FormData): Promise<never> {
  const parsed = itemSchema.safeParse({
    clinicId: formData.get("clinicId"),
    name: formData.get("name"),
    category: formData.get("category") ?? "",
    sku: formData.get("sku") ?? "",
    unit: formData.get("unit"),
    reorderLevel: formData.get("reorderLevel"),
    unitCost: formData.get("unitCost") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [
    ClinicRole.OWNER,
  ]);
  try {
    await prisma.inventoryItem.create({
      data: {
        clinicId: membership.clinicId,
        name: parsed.data.name,
        category: parsed.data.category || null,
        sku: parsed.data.sku || null,
        unit: parsed.data.unit,
        reorderLevel: new Prisma.Decimal(parsed.data.reorderLevel),
        unitCost:
          parsed.data.unitCost === "" || parsed.data.unitCost === undefined
            ? null
            : new Prisma.Decimal(parsed.data.unitCost),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect(inventoryPath(membership.clinicId, "duplicate-sku"));
    }
    console.error("Inventory item creation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    redirect(inventoryPath(membership.clinicId, "error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/inventory`);
  redirect(inventoryPath(membership.clinicId, "created"));
}

export async function recordInventoryMovement(
  formData: FormData,
): Promise<never> {
  const parsed = movementSchema.safeParse({
    clinicId: formData.get("clinicId"),
    itemId: formData.get("itemId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost") ?? "",
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [
    ClinicRole.OWNER,
  ]);
  try {
    await prisma.$transaction(
      async (transaction) => {
        const item = await transaction.inventoryItem.findFirst({
          where: {
            id: parsed.data.itemId,
            clinicId: membership.clinicId,
            active: true,
          },
          select: { id: true, currentStock: true },
        });
        if (!item) throw new Error("ITEM_NOT_FOUND");
        const quantity = new Prisma.Decimal(parsed.data.quantity);
        const nextStock =
          parsed.data.type === "STOCK_IN"
            ? item.currentStock.plus(quantity)
            : item.currentStock.minus(quantity);
        if (nextStock.isNegative()) throw new Error("INSUFFICIENT_STOCK");
        await transaction.inventoryItem.update({
          where: { id: item.id },
          data: {
            currentStock: nextStock,
            ...(parsed.data.type === "STOCK_IN" &&
            parsed.data.unitCost !== "" &&
            parsed.data.unitCost !== undefined
              ? { unitCost: new Prisma.Decimal(parsed.data.unitCost) }
              : {}),
          },
        });
        await transaction.inventoryTransaction.create({
          data: {
            clinicId: membership.clinicId,
            itemId: item.id,
            actorUserId: membership.userId,
            type: parsed.data.type,
            quantity,
            unitCost:
              parsed.data.unitCost === "" || parsed.data.unitCost === undefined
                ? null
                : new Prisma.Decimal(parsed.data.unitCost),
            reference: parsed.data.reference || null,
            notes: parsed.data.notes || null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      redirect(inventoryPath(membership.clinicId, "insufficient-stock"));
    }
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      redirect(inventoryPath(membership.clinicId, "item-not-found"));
    }
    console.error("Inventory movement failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    redirect(inventoryPath(membership.clinicId, "error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/inventory`);
  redirect(inventoryPath(membership.clinicId, "updated"));
}

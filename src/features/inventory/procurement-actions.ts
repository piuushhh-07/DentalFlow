"use server";

import { ClinicRole, InventoryPurchaseOrderStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { assertFeatureEnabled, BillingAccessRestrictedError, BillingFeatureUnavailableError } from "@/features/billing/lib/billing-entitlements";
import { prisma } from "@/lib/db/prisma";

const uuid = z.string().uuid();
const supplierSchema = z.object({
  clinicId: uuid,
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.union([z.literal(""), z.string().email().max(254)]).optional(),
  gstin: z.string().trim().max(15).optional(),
  address: z.string().trim().max(500).optional(),
});
const orderSchema = z.object({
  clinicId: uuid,
  supplierId: uuid,
  orderNumber: z.string().trim().min(2).max(40),
  expectedAt: z.union([z.literal(""), z.coerce.date()]).optional(),
  notes: z.string().trim().max(1000).optional(),
  itemId: uuid,
  quantity: z.coerce.number().finite().positive().max(1000000),
  unitCost: z.coerce.number().finite().min(0).max(1000000000),
});
const receiveSchema = z.object({
  clinicId: uuid,
  orderId: uuid,
  lineId: uuid,
  quantity: z.coerce.number().finite().positive().max(1000000),
  batchNumber: z.string().trim().min(1).max(100),
  expiryDate: z.union([z.literal(""), z.coerce.date()]).optional(),
});
const supplierReturnSchema = z.object({
  clinicId: uuid,
  batchId: uuid,
  quantity: z.coerce.number().finite().positive().max(1000000).refine((value) => Number.isInteger(value * 1000)),
  reason: z.string().trim().min(3).max(400),
});

function path(clinicId: string, status: string) {
  return `/clinic/${clinicId}/inventory/procurement?status=${status}`;
}
function handleError(clinicId: string, error: unknown): never {
  if (error instanceof BillingFeatureUnavailableError) redirect(path(clinicId, "upgrade-required"));
  if (error instanceof BillingAccessRestrictedError) redirect(path(clinicId, "subscription-restricted"));
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") redirect(path(clinicId, "duplicate"));
  console.error("Inventory procurement action failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  redirect(path(clinicId, "error"));
}

export async function createInventorySupplier(formData: FormData): Promise<never> {
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "inventoryManagement");
      await tx.inventorySupplier.create({ data: {
        clinicId: membership.clinicId, name: parsed.data.name,
        contactName: parsed.data.contactName || null, phone: parsed.data.phone || null,
        email: parsed.data.email || null, gstin: parsed.data.gstin || null,
        address: parsed.data.address || null,
      }});
    });
  } catch (error) { handleError(membership.clinicId, error); }
  revalidatePath(`/clinic/${membership.clinicId}/inventory/procurement`);
  redirect(path(membership.clinicId, "supplier-created"));
}

export async function createInventoryPurchaseOrder(formData: FormData): Promise<never> {
  const parsed = orderSchema.safeParse({
    clinicId: formData.get("clinicId"), supplierId: formData.get("supplierId"),
    orderNumber: formData.get("orderNumber"), expectedAt: formData.get("expectedAt") || "",
    notes: formData.get("notes") || "", itemId: formData.get("itemId"),
    quantity: formData.get("quantity"), unitCost: formData.get("unitCost"),
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "inventoryManagement");
      const supplier = await tx.inventorySupplier.findFirst({ where: { id: parsed.data.supplierId, clinicId: membership.clinicId, active: true }, select: { id: true } });
      if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
      const item = await tx.inventoryItem.findFirst({ where: { id: parsed.data.itemId, clinicId: membership.clinicId, active: true }, select: { id: true } });
      if (!item) throw new Error("ITEM_NOT_FOUND");
      await tx.inventoryPurchaseOrder.create({ data: {
        clinicId: membership.clinicId, supplierId: supplier.id, orderNumber: parsed.data.orderNumber,
        expectedAt: parsed.data.expectedAt ? new Date(parsed.data.expectedAt) : null,
        notes: parsed.data.notes || null,
        lines: { create: [{
          itemId: item.id,
          quantityOrdered: new Prisma.Decimal(parsed.data.quantity), unitCost: new Prisma.Decimal(parsed.data.unitCost),
        }] },
      }});
    });
  } catch (error) { handleError(membership.clinicId, error); }
  revalidatePath(`/clinic/${membership.clinicId}/inventory/procurement`);
  redirect(path(membership.clinicId, "order-created"));
}

export async function receiveInventoryPurchaseOrderLine(formData: FormData): Promise<never> {
  const parsed = receiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "inventoryManagement");
      const line = await tx.inventoryPurchaseOrderLine.findFirst({
        where: { id: parsed.data.lineId, clinicId: membership.clinicId, orderId: parsed.data.orderId },
        include: { order: { select: { supplierId: true, status: true } } },
      });
      if (!line || line.order.status === InventoryPurchaseOrderStatus.CANCELLED || line.order.status === InventoryPurchaseOrderStatus.RECEIVED) throw new Error("ORDER_NOT_RECEIVABLE");
      const qty = new Prisma.Decimal(parsed.data.quantity);
      if (line.quantityReceived.plus(qty).greaterThan(line.quantityOrdered)) throw new Error("OVER_RECEIVED");
      const item = await tx.inventoryItem.findFirst({ where: { id: line.itemId, clinicId: membership.clinicId, active: true }, select: { id: true, currentStock: true } });
      if (!item) throw new Error("ITEM_NOT_FOUND");
      await tx.inventoryBatch.create({ data: {
        clinicId: membership.clinicId, itemId: item.id, supplierId: line.order.supplierId,
        batchNumber: parsed.data.batchNumber, expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
        quantityReceived: qty, quantityRemaining: qty, unitCost: line.unitCost,
      }});
      await tx.inventoryItem.update({ where: { id: item.id }, data: { currentStock: item.currentStock.plus(qty), unitCost: line.unitCost } });
      await tx.inventoryTransaction.create({ data: {
        clinicId: membership.clinicId, itemId: item.id, actorUserId: membership.userId,
        type: "STOCK_IN", quantity: qty, unitCost: line.unitCost, reference: parsed.data.orderId,
        notes: `Received batch ${parsed.data.batchNumber}`,
      }});
      const updatedLine = await tx.inventoryPurchaseOrderLine.update({ where: { id: line.id }, data: { quantityReceived: line.quantityReceived.plus(qty) } });
      const allLines = await tx.inventoryPurchaseOrderLine.findMany({ where: { orderId: parsed.data.orderId, clinicId: membership.clinicId }, select: { id: true, quantityOrdered: true, quantityReceived: true } });
      const receivedAll = allLines.every((entry) => entry.id === updatedLine.id ? updatedLine.quantityReceived.greaterThanOrEqualTo(entry.quantityOrdered) : entry.quantityReceived.greaterThanOrEqualTo(entry.quantityOrdered));
      await tx.inventoryPurchaseOrder.update({ where: { id: parsed.data.orderId }, data: { status: receivedAll ? InventoryPurchaseOrderStatus.RECEIVED : InventoryPurchaseOrderStatus.PARTIALLY_RECEIVED } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "OVER_RECEIVED") redirect(path(membership.clinicId, "over-received"));
    if (error instanceof Error && error.message === "ORDER_NOT_RECEIVABLE") redirect(path(membership.clinicId, "order-not-receivable"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/inventory`);
  revalidatePath(`/clinic/${membership.clinicId}/inventory/procurement`);
  redirect(path(membership.clinicId, "received"));
}

export async function returnInventoryBatchToSupplier(formData: FormData): Promise<never> {
  const parsed = supplierReturnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "inventoryManagement");
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: parsed.data.batchId, clinicId: membership.clinicId, quantityRemaining: { gt: 0 }, supplierId: { not: null } },
        include: {
          supplier: { select: { id: true, name: true, active: true } },
          item: { select: { id: true, currentStock: true, name: true } },
        },
      });
      if (!batch || !batch.supplier || !batch.supplier.active) throw new Error("BATCH_NOT_RETURNABLE");
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      if (batch.quantityRemaining.lessThan(quantity) || batch.item.currentStock.lessThan(quantity)) throw new Error("INSUFFICIENT_RETURN_STOCK");
      const updatedBatch = await tx.inventoryBatch.updateMany({
        where: { id: batch.id, clinicId: membership.clinicId, quantityRemaining: { gte: quantity } },
        data: { quantityRemaining: { decrement: quantity } },
      });
      if (updatedBatch.count !== 1) throw new Error("INSUFFICIENT_RETURN_STOCK");
      const updatedItem = await tx.inventoryItem.updateMany({
        where: { id: batch.item.id, clinicId: membership.clinicId, currentStock: { gte: quantity } },
        data: { currentStock: { decrement: quantity } },
      });
      if (updatedItem.count !== 1) throw new Error("INSUFFICIENT_RETURN_STOCK");
      await tx.inventoryTransaction.create({
        data: {
          clinicId: membership.clinicId, itemId: batch.item.id, actorUserId: membership.userId,
          type: "SUPPLIER_RETURN", quantity, unitCost: batch.unitCost, reference: batch.id,
          notes: `Supplier: ${batch.supplier.name} · Batch: ${batch.batchNumber} · Reason: ${parsed.data.reason}`.slice(0, 500),
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "BATCH_NOT_RETURNABLE") redirect(path(membership.clinicId, "batch-not-returnable"));
    if (error instanceof Error && error.message === "INSUFFICIENT_RETURN_STOCK") redirect(path(membership.clinicId, "insufficient-return-stock"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/inventory`);
  revalidatePath(`/clinic/${membership.clinicId}/inventory/procurement`);
  redirect(path(membership.clinicId, "supplier-returned"));
}
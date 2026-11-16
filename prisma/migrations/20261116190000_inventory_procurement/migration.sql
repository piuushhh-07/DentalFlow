CREATE TYPE "InventoryPurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "inventory_suppliers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "contactName" VARCHAR(120),
  "phone" VARCHAR(20),
  "email" VARCHAR(254),
  "gstin" VARCHAR(15),
  "address" VARCHAR(500),
  "notes" VARCHAR(1000),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "inventory_suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_suppliers_id_clinicId_key" ON "inventory_suppliers"("id","clinicId");
CREATE UNIQUE INDEX "inventory_suppliers_clinicId_name_key" ON "inventory_suppliers"("clinicId","name");
CREATE INDEX "inventory_suppliers_clinicId_active_name_idx" ON "inventory_suppliers"("clinicId","active","name");
ALTER TABLE "inventory_suppliers" ADD CONSTRAINT "inventory_suppliers_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inventory_purchase_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "orderNumber" VARCHAR(40) NOT NULL,
  "status" "InventoryPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "orderedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedAt" DATE,
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "inventory_purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_purchase_orders_id_clinicId_key" ON "inventory_purchase_orders"("id","clinicId");
CREATE UNIQUE INDEX "inventory_purchase_orders_clinicId_orderNumber_key" ON "inventory_purchase_orders"("clinicId","orderNumber");
CREATE INDEX "inventory_purchase_orders_clinicId_status_orderedAt_idx" ON "inventory_purchase_orders"("clinicId","status","orderedAt");
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_supplierId_clinicId_fkey" FOREIGN KEY ("supplierId","clinicId") REFERENCES "inventory_suppliers"("id","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_purchase_order_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantityOrdered" DECIMAL(12,3) NOT NULL,
  "quantityReceived" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_purchase_order_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_purchase_order_lines_clinicId_orderId_idx" ON "inventory_purchase_order_lines"("clinicId","orderId");
CREATE INDEX "inventory_purchase_order_lines_clinicId_itemId_idx" ON "inventory_purchase_order_lines"("clinicId","itemId");
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_orderId_clinicId_fkey" FOREIGN KEY ("orderId","clinicId") REFERENCES "inventory_purchase_orders"("id","clinicId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_itemId_clinicId_fkey" FOREIGN KEY ("itemId","clinicId") REFERENCES "inventory_items"("id","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "supplierId" UUID,
  "batchNumber" VARCHAR(100) NOT NULL,
  "expiryDate" DATE,
  "quantityReceived" DECIMAL(12,3) NOT NULL,
  "quantityRemaining" DECIMAL(12,3) NOT NULL,
  "unitCost" DECIMAL(12,2),
  "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_batches_clinicId_itemId_batchNumber_key" ON "inventory_batches"("clinicId","itemId","batchNumber");
CREATE INDEX "inventory_batches_clinicId_expiryDate_quantityRemaining_idx" ON "inventory_batches"("clinicId","expiryDate","quantityRemaining");
CREATE INDEX "inventory_batches_clinicId_itemId_receivedAt_idx" ON "inventory_batches"("clinicId","itemId","receivedAt");
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_itemId_clinicId_fkey" FOREIGN KEY ("itemId","clinicId") REFERENCES "inventory_items"("id","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_supplierId_clinicId_fkey" FOREIGN KEY ("supplierId","clinicId") REFERENCES "inventory_suppliers"("id","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

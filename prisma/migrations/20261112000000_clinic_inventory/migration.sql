CREATE TABLE "inventory_items" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(100),
  "sku" VARCHAR(80),
  "unit" VARCHAR(24) NOT NULL DEFAULT 'pcs',
  "currentStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "reorderLevel" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_items_stock_nonnegative_check" CHECK ("currentStock" >= 0),
  CONSTRAINT "inventory_items_reorder_nonnegative_check" CHECK ("reorderLevel" >= 0),
  CONSTRAINT "inventory_items_cost_nonnegative_check" CHECK ("unitCost" IS NULL OR "unitCost" >= 0),
  CONSTRAINT "inventory_items_clinicId_fkey" FOREIGN KEY ("clinicId")
    REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "inventory_items_id_clinicId_key" ON "inventory_items"("id", "clinicId");
CREATE UNIQUE INDEX "inventory_items_clinicId_sku_key" ON "inventory_items"("clinicId", "sku");
CREATE INDEX "inventory_items_clinicId_active_name_idx" ON "inventory_items"("clinicId", "active", "name");
CREATE INDEX "inventory_items_clinicId_currentStock_reorderLevel_idx" ON "inventory_items"("clinicId", "currentStock", "reorderLevel");

CREATE TABLE "inventory_transactions" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "type" VARCHAR(16) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitCost" DECIMAL(12,2),
  "reference" VARCHAR(120),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_transactions_type_check" CHECK ("type" IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT')),
  CONSTRAINT "inventory_transactions_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_transactions_cost_check" CHECK ("unitCost" IS NULL OR "unitCost" >= 0),
  CONSTRAINT "inventory_transactions_clinicId_fkey" FOREIGN KEY ("clinicId")
    REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_transactions_itemId_clinicId_fkey" FOREIGN KEY ("itemId", "clinicId")
    REFERENCES "inventory_items"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_transactions_actorUserId_clinicId_fkey" FOREIGN KEY ("actorUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "inventory_transactions_clinicId_createdAt_idx" ON "inventory_transactions"("clinicId", "createdAt");
CREATE INDEX "inventory_transactions_clinicId_itemId_createdAt_idx" ON "inventory_transactions"("clinicId", "itemId", "createdAt");
CREATE INDEX "fk_inventory_tx_item_id_2c" ON "inventory_transactions"("itemId", "clinicId");
CREATE INDEX "fk_inventory_tx_actor_user_id_2c" ON "inventory_transactions"("actorUserId", "clinicId");

ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_transactions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "inventory_items" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "inventory_transactions" FROM anon, authenticated, service_role;

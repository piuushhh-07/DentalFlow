CREATE TABLE "cash_register_closes" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "closedByUserId" UUID NOT NULL,
  "businessDate" DATE NOT NULL,
  "openingCash" DECIMAL(12,2) NOT NULL,
  "cashCollections" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cashRefunds" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cashExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "expectedCash" DECIMAL(12,2) NOT NULL,
  "countedCash" DECIMAL(12,2) NOT NULL,
  "cashVariance" DECIMAL(12,2) NOT NULL,
  "upiCollections" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cardCollections" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "bankTransferCollections" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherCollections" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" VARCHAR(1000),
  "closedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_register_closes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_register_closes_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cash_register_closes_closedByUserId_clinicId_fkey" FOREIGN KEY ("closedByUserId", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cash_register_closes_clinicId_businessDate_key" ON "cash_register_closes"("clinicId", "businessDate");
CREATE INDEX "cash_register_closes_clinicId_closedAt_idx" ON "cash_register_closes"("clinicId", "closedAt");
CREATE INDEX "cash_register_closes_closedByUserId_clinicId_idx" ON "cash_register_closes"("closedByUserId", "clinicId");

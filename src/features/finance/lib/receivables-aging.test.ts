import assert from "node:assert/strict";
import test from "node:test";

import { buildReceivablesAging, getReceivableAgeBucket } from "./receivables-aging";

test("assigns receivable age bucket boundaries exactly", () => {
  assert.equal(getReceivableAgeBucket(0), "CURRENT_0_30");
  assert.equal(getReceivableAgeBucket(30), "CURRENT_0_30");
  assert.equal(getReceivableAgeBucket(31), "DAYS_31_60");
  assert.equal(getReceivableAgeBucket(60), "DAYS_31_60");
  assert.equal(getReceivableAgeBucket(61), "DAYS_61_90");
  assert.equal(getReceivableAgeBucket(90), "DAYS_61_90");
  assert.equal(getReceivableAgeBucket(91), "OVER_90");
  assert.throws(() => getReceivableAgeBucket(-1), RangeError);
});

test("ages open balances and excludes paid or credited plans", () => {
  const asOf = new Date("2026-11-17T00:00:00.000Z");
  const result = buildReceivablesAging([
    {
      id: "old",
      patientName: "Older patient",
      patientPhone: "9000000001",
      treatmentName: "Root canal",
      openedAt: new Date("2026-08-01T00:00:00.000Z"),
      billedAmount: "10000.00",
      discounts: "500.00",
      payments: "2500.00",
      refunds: "0.00",
    },
    {
      id: "partial",
      patientName: "Recent patient",
      patientPhone: "9000000002",
      treatmentName: "Crown",
      openedAt: new Date("2026-11-01T00:00:00.000Z"),
      billedAmount: "5000.00",
      discounts: "0.00",
      payments: "1000.00",
      refunds: "200.00",
    },
    {
      id: "paid",
      patientName: "Paid patient",
      patientPhone: "9000000003",
      treatmentName: "Cleaning",
      openedAt: new Date("2026-11-10T00:00:00.000Z"),
      billedAmount: "1000.00",
      discounts: "0.00",
      payments: "1000.00",
      refunds: "0.00",
    },
    {
      id: "credit",
      patientName: "Credit patient",
      patientPhone: "9000000004",
      treatmentName: "Filling",
      openedAt: new Date("2026-11-10T00:00:00.000Z"),
      billedAmount: "1000.00",
      discounts: "0.00",
      payments: "1200.00",
      refunds: "0.00",
    },
  ], asOf);

  assert.equal(result.totalPlans, 2);
  assert.equal(result.totalOutstandingPaise, 1_120_000);
  assert.equal(result.buckets.OVER_90.count, 1);
  assert.equal(result.buckets.OVER_90.amountPaise, 700_000);
  assert.equal(result.buckets.CURRENT_0_30.count, 1);
  assert.equal(result.buckets.CURRENT_0_30.amountPaise, 420_000);
  assert.deepEqual(result.items.map((item) => item.id), ["old", "partial"]);
});

test("uses integer paise for balances and prevents negative ages", () => {
  const result = buildReceivablesAging([{
    id: "fractional",
    patientName: "Patient",
    patientPhone: "9000000000",
    treatmentName: "Filling",
    openedAt: new Date("2026-11-20T00:00:00.000Z"),
    billedAmount: "0.30",
    discounts: "0.00",
    payments: "0.10",
    refunds: "0.00",
  }], new Date("2026-11-17T00:00:00.000Z"));
  assert.equal(result.items[0].ageDays, 0);
  assert.equal(result.totalOutstandingPaise, 20);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateVendorBillPayment,
  getVendorBillStatus,
} from "./vendor-bill-rules";

test("derives open, partial, and paid states from ledger totals", () => {
  assert.equal(getVendorBillStatus(10000, 0), "OPEN");
  assert.equal(getVendorBillStatus(10000, 2500), "PARTIALLY_PAID");
  assert.equal(getVendorBillStatus(10000, 2500 + 3000), "PARTIALLY_PAID");
  assert.equal(getVendorBillStatus(10000, 10000), "PAID");
});

test("accepts a full payment and rejects an overpayment", () => {
  assert.equal(
    evaluateVendorBillPayment({
      isDuplicate: false,
      isVoid: false,
      totalMinor: 10000,
      paidMinor: 0,
      paymentMinor: 10000,
    }),
    "ACCEPT",
  );
  assert.equal(
    evaluateVendorBillPayment({
      isDuplicate: false,
      isVoid: false,
      totalMinor: 10000,
      paidMinor: 7500,
      paymentMinor: 2501,
    }),
    "OVERPAYMENT",
  );
});

test("rejects duplicate submissions and payments against void bills", () => {
  assert.equal(
    evaluateVendorBillPayment({
      isDuplicate: true,
      isVoid: false,
      totalMinor: 10000,
      paidMinor: 0,
      paymentMinor: 1000,
    }),
    "DUPLICATE",
  );
  assert.equal(
    evaluateVendorBillPayment({
      isDuplicate: false,
      isVoid: true,
      totalMinor: 10000,
      paidMinor: 0,
      paymentMinor: 1000,
    }),
    "VOID",
  );
});

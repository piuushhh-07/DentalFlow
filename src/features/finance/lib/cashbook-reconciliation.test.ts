import assert from "node:assert/strict";
import test from "node:test";
import { FinancialEntryType, PaymentMethod } from "@prisma/client";

import {
  assertCashRegisterNotClosed,
  calculateCashbookReconciliation,
  collectionNetMinor,
  midpointOfLocalDate,
  nextBusinessDate,
  requireCashbookPaymentMethod,
  startOfLocalDate,
  type CashbookCollection,
} from "./cashbook-reconciliation";

test("reconciles cash collections, refunds, expenses, payouts, and vendor payments", () => {
  const entries: CashbookCollection[] = [
    {
      entryType: FinancialEntryType.PAYMENT,
      paymentMethod: PaymentMethod.CASH,
      amountMinor: 50000,
    },
    {
      entryType: FinancialEntryType.REFUND,
      paymentMethod: PaymentMethod.CASH,
      amountMinor: 5000,
    },
    {
      entryType: FinancialEntryType.PAYMENT,
      paymentMethod: PaymentMethod.UPI,
      amountMinor: 15000,
    },
  ];
  const result = calculateCashbookReconciliation({
    openingCashMinor: 100000,
    countedCashMinor: 119500,
    entries,
    clinicExpenses: [
      { paymentMethod: PaymentMethod.CASH, amountMinor: 10000 },
      { paymentMethod: PaymentMethod.UPI, amountMinor: 5000 },
    ],
    dentistPayouts: [
      { paymentMethod: PaymentMethod.CASH, amountMinor: 8000 },
      { paymentMethod: PaymentMethod.BANK_TRANSFER, amountMinor: 2000 },
    ],
    vendorBillPayments: [
      { paymentMethod: PaymentMethod.CASH, amountMinor: 7000 },
      { paymentMethod: PaymentMethod.CARD, amountMinor: 3000 },
      { paymentMethod: PaymentMethod.UPI, amountMinor: 2000 },
      { paymentMethod: PaymentMethod.BANK_TRANSFER, amountMinor: 4000 },
      { paymentMethod: PaymentMethod.OTHER, amountMinor: 5000 },
    ],
  });

  assert.deepEqual(result, {
    cashCollections: 50000,
    cashRefunds: 5000,
    cashClinicExpenses: 10000,
    cashDentistPayouts: 8000,
    cashVendorBillPayments: 7000,
    cashExpenses: 25000,
    expectedCash: 120000,
    cashVariance: -500,
  });
});

test("keeps UPI, card, bank, and other collections separate from cash", () => {
  const entries: CashbookCollection[] = [
    {
      entryType: FinancialEntryType.PAYMENT,
      paymentMethod: PaymentMethod.UPI,
      amountMinor: 1800,
    },
    {
      entryType: FinancialEntryType.REFUND,
      paymentMethod: PaymentMethod.UPI,
      amountMinor: 300,
    },
    {
      entryType: FinancialEntryType.PAYMENT,
      paymentMethod: PaymentMethod.CARD,
      amountMinor: 2200,
    },
    {
      entryType: FinancialEntryType.PAYMENT,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      amountMinor: 3300,
    },
    {
      entryType: FinancialEntryType.PAYMENT,
      paymentMethod: PaymentMethod.OTHER,
      amountMinor: 400,
    },
  ];

  assert.equal(collectionNetMinor(entries, PaymentMethod.UPI), 1500);
  assert.equal(collectionNetMinor(entries, PaymentMethod.CARD), 2200);
  assert.equal(collectionNetMinor(entries, PaymentMethod.BANK_TRANSFER), 3300);
  assert.equal(collectionNetMinor(entries, PaymentMethod.OTHER), 400);
});

test("refuses reconciliation when a treatment entry has no payment method", () => {
  assert.throws(
    () => requireCashbookPaymentMethod(null),
    /CASHBOOK_ENTRY_MISSING_PAYMENT_METHOD/,
  );
  assert.equal(
    requireCashbookPaymentMethod(PaymentMethod.CASH),
    PaymentMethod.CASH,
  );
});

test("prevents a second close for an already-closed business date", () => {
  assert.doesNotThrow(() => assertCashRegisterNotClosed(false));
  assert.throws(
    () => assertCashRegisterNotClosed(true),
    /CASH_REGISTER_ALREADY_CLOSED/,
  );
});

test("uses clinic-local half-open business-date boundaries across daylight saving changes", () => {
  const springStart = startOfLocalDate("2026-03-08", "America/New_York");
  const springEnd = startOfLocalDate(
    nextBusinessDate("2026-03-08"),
    "America/New_York",
  );
  const fallStart = startOfLocalDate("2026-11-01", "America/New_York");
  const fallEnd = startOfLocalDate(
    nextBusinessDate("2026-11-01"),
    "America/New_York",
  );

  assert.equal(springStart.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(springEnd.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(fallStart.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(fallEnd.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(
    midpointOfLocalDate("2026-03-08", "Asia/Kolkata").toISOString(),
    "2026-03-08T06:30:00.000Z",
  );
  assert.equal(
    midpointOfLocalDate("2026-03-08", "Pacific/Kiritimati").toISOString(),
    "2026-03-07T22:00:00.000Z",
  );
});

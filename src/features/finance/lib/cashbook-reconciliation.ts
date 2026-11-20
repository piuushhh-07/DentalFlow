import { FinancialEntryType, PaymentMethod } from "@prisma/client";

export type CashbookEntry = Readonly<{
  paymentMethod: PaymentMethod;
  amountMinor: number;
}>;

export type CashbookCollection = CashbookEntry &
  Readonly<{ entryType: FinancialEntryType }>;

export function requireCashbookPaymentMethod(
  paymentMethod: PaymentMethod | null,
): PaymentMethod {
  if (paymentMethod === null) {
    throw new Error("CASHBOOK_ENTRY_MISSING_PAYMENT_METHOD");
  }
  return paymentMethod;
}

export function assertCashRegisterNotClosed(alreadyClosed: boolean): void {
  if (alreadyClosed) throw new Error("CASH_REGISTER_ALREADY_CLOSED");
}

function sumCash(entries: readonly CashbookEntry[]): number {
  return entries
    .filter((entry) => entry.paymentMethod === PaymentMethod.CASH)
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
}

export function collectionNetMinor(
  entries: readonly CashbookCollection[],
  paymentMethod: PaymentMethod,
): number {
  return entries.reduce((sum, entry) => {
    if (entry.paymentMethod !== paymentMethod) return sum;
    return entry.entryType === FinancialEntryType.PAYMENT
      ? sum + entry.amountMinor
      : entry.entryType === FinancialEntryType.REFUND
        ? sum - entry.amountMinor
        : sum;
  }, 0);
}

export function calculateCashbookReconciliation({
  openingCashMinor,
  countedCashMinor,
  entries,
  clinicExpenses,
  dentistPayouts,
  vendorBillPayments,
}: {
  openingCashMinor: number;
  countedCashMinor: number;
  entries: readonly CashbookCollection[];
  clinicExpenses: readonly CashbookEntry[];
  dentistPayouts: readonly CashbookEntry[];
  vendorBillPayments: readonly CashbookEntry[];
}) {
  const cashCollections = entries
    .filter(
      (entry) =>
        entry.paymentMethod === PaymentMethod.CASH &&
        entry.entryType === FinancialEntryType.PAYMENT,
    )
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const cashRefunds = entries
    .filter(
      (entry) =>
        entry.paymentMethod === PaymentMethod.CASH &&
        entry.entryType === FinancialEntryType.REFUND,
    )
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const cashClinicExpenses = sumCash(clinicExpenses);
  const cashDentistPayouts = sumCash(dentistPayouts);
  const cashVendorBillPayments = sumCash(vendorBillPayments);
  const cashExpenses =
    cashClinicExpenses + cashDentistPayouts + cashVendorBillPayments;
  const expectedCash =
    openingCashMinor + cashCollections - cashRefunds - cashExpenses;

  return {
    cashCollections,
    cashRefunds,
    cashClinicExpenses,
    cashDentistPayouts,
    cashVendorBillPayments,
    cashExpenses,
    expectedCash,
    cashVariance: countedCashMinor - expectedCash,
  };
}

export function startOfLocalDate(date: string, timeZone: string): Date {
  const desired = new Date(`${date}T00:00:00.000Z`).getTime();
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    candidate += desired - represented;
  }
  return new Date(candidate);
}

export function nextBusinessDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function midpointOfLocalDate(date: string, timeZone: string): Date {
  const start = startOfLocalDate(date, timeZone);
  const end = startOfLocalDate(nextBusinessDate(date), timeZone);
  return new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
}

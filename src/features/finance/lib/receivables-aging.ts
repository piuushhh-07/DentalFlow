export type ReceivableAgeBucket = "CURRENT_0_30" | "DAYS_31_60" | "DAYS_61_90" | "OVER_90";

export type ReceivablePlanInput = Readonly<{
  id: string;
  patientName: string;
  patientPhone: string;
  treatmentName: string;
  openedAt: Date;
  billedAmount: string | number;
  discounts: string | number;
  payments: string | number;
  refunds: string | number;
}>;

export type ReceivableItem = Readonly<{
  id: string;
  patientName: string;
  patientPhone: string;
  treatmentName: string;
  openedAt: Date;
  ageDays: number;
  bucket: ReceivableAgeBucket;
  outstandingPaise: number;
}>;

export type ReceivablesAgingSummary = Readonly<{
  totalOutstandingPaise: number;
  totalPlans: number;
  buckets: Record<ReceivableAgeBucket, { count: number; amountPaise: number }>;
  items: ReceivableItem[];
}>;

function toPaise(value: string | number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new RangeError("Financial amounts must be finite.");
  return Math.round(amount * 100);
}

function daysBetween(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(0, Math.floor((endDay - startDay) / 86_400_000));
}

export function getReceivableAgeBucket(ageDays: number): ReceivableAgeBucket {
  if (!Number.isInteger(ageDays) || ageDays < 0) {
    throw new RangeError("Receivable age must be a non-negative whole number.");
  }
  if (ageDays <= 30) return "CURRENT_0_30";
  if (ageDays <= 60) return "DAYS_31_60";
  if (ageDays <= 90) return "DAYS_61_90";
  return "OVER_90";
}

export function buildReceivablesAging(
  plans: readonly ReceivablePlanInput[],
  asOfDate: Date,
): ReceivablesAgingSummary {
  const buckets: ReceivablesAgingSummary["buckets"] = {
    CURRENT_0_30: { count: 0, amountPaise: 0 },
    DAYS_31_60: { count: 0, amountPaise: 0 },
    DAYS_61_90: { count: 0, amountPaise: 0 },
    OVER_90: { count: 0, amountPaise: 0 },
  };

  const items = plans.flatMap((plan) => {
    const outstandingPaise =
      toPaise(plan.billedAmount) -
      toPaise(plan.discounts) -
      toPaise(plan.payments) +
      toPaise(plan.refunds);
    if (outstandingPaise <= 0) return [];
    const ageDays = daysBetween(plan.openedAt, asOfDate);
    const bucket = getReceivableAgeBucket(ageDays);
    buckets[bucket].count += 1;
    buckets[bucket].amountPaise += outstandingPaise;
    return [{
      id: plan.id,
      patientName: plan.patientName,
      patientPhone: plan.patientPhone,
      treatmentName: plan.treatmentName,
      openedAt: plan.openedAt,
      ageDays,
      bucket,
      outstandingPaise,
    }];
  });

  items.sort((a, b) => b.ageDays - a.ageDays || b.outstandingPaise - a.outstandingPaise);
  return {
    totalOutstandingPaise: Object.values(buckets).reduce((sum, bucket) => sum + bucket.amountPaise, 0),
    totalPlans: items.length,
    buckets,
    items,
  };
}

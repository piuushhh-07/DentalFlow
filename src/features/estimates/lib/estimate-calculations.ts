const MAX_AMOUNT_PAISE = 999_999_999_999;

function amountToPaise(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function paiseToAmount(value: number) {
  return (value / 100).toFixed(2);
}

export function calculateTreatmentEstimateTotals(
  lines: readonly { quantity: number; unitPrice: string }[],
  discountAmount: string,
  taxRate: string,
) {
  const lineTotals = lines.map((line) => {
    const lineTotalPaise = amountToPaise(line.unitPrice) * line.quantity;
    if (
      !Number.isSafeInteger(lineTotalPaise) ||
      lineTotalPaise > MAX_AMOUNT_PAISE
    ) {
      throw new Error("A procedure total exceeds the supported amount.");
    }
    return lineTotalPaise;
  });
  const subtotalPaise = lineTotals.reduce((sum, total) => sum + total, 0);
  const discountPaise = amountToPaise(discountAmount);
  if (discountPaise > subtotalPaise) {
    throw new Error("Discount cannot exceed the estimate subtotal.");
  }
  if (subtotalPaise > MAX_AMOUNT_PAISE) {
    throw new Error("Estimate subtotal exceeds the supported amount.");
  }

  const taxRateHundredths = amountToPaise(taxRate);
  if (taxRateHundredths > 10000) {
    throw new Error("Tax rate cannot exceed 100%.");
  }
  const taxablePaise = BigInt(subtotalPaise - discountPaise);
  const taxPaise =
    (taxablePaise * BigInt(taxRateHundredths) + BigInt(5000)) / BigInt(10000);
  const totalPaise = taxablePaise + taxPaise;
  if (totalPaise > BigInt(MAX_AMOUNT_PAISE)) {
    throw new Error("Estimate total exceeds the supported amount.");
  }

  return {
    lineTotals: lineTotals.map(paiseToAmount),
    subtotal: paiseToAmount(subtotalPaise),
    discountAmount: paiseToAmount(discountPaise),
    taxRate: (taxRateHundredths / 100).toFixed(2),
    taxAmount: paiseToAmount(Number(taxPaise)),
    totalAmount: paiseToAmount(Number(totalPaise)),
  };
}

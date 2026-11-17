import assert from "node:assert/strict";
import test from "node:test";

import {
  getPayoutState,
  isPayoutOverpayment,
  toMinorUnits,
} from "./dentist-payouts";

test("converts rupee amounts to integer paise without floating point drift", () => {
  assert.equal(toMinorUnits("1250.35"), 125035);
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
});

test("rejects invalid payout amounts", () => {
  assert.throws(() => toMinorUnits(Number.NaN), RangeError);
  assert.throws(() => toMinorUnits(-1), RangeError);
});

test("allows exact and partial payments but blocks overpayment", () => {
  assert.equal(isPayoutOverpayment(10000, 0, 4000), false);
  assert.equal(isPayoutOverpayment(10000, 4000, 6000), false);
  assert.equal(isPayoutOverpayment(10000, 4000, 6001), true);
});

test("derives payout state from the immutable payment total", () => {
  assert.equal(getPayoutState(10000, 0), "OPEN");
  assert.equal(getPayoutState(10000, 2500), "PARTIALLY_PAID");
  assert.equal(getPayoutState(10000, 10000), "PAID");
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getMonthOverMonthChange } from "@/features/clinic-groups/lib/branch-monthly-comparison";

describe("branch month-over-month comparison", () => {
  it("calculates positive and negative changes against the prior absolute value", () => {
    assert.deepEqual(getMonthOverMonthChange(125, 100), {
      absoluteChange: 25,
      percentageChange: 25,
    });
    assert.deepEqual(getMonthOverMonthChange(75, 100), {
      absoluteChange: -25,
      percentageChange: -25,
    });
    assert.deepEqual(getMonthOverMonthChange(-50, -100), {
      absoluteChange: 50,
      percentageChange: 50,
    });
  });

  it("returns no percentage when the previous period is zero", () => {
    assert.deepEqual(getMonthOverMonthChange(40, 0), {
      absoluteChange: 40,
      percentageChange: null,
    });
  });

  it("rejects non-finite inputs", () => {
    assert.throws(() => getMonthOverMonthChange(Number.NaN, 1), RangeError);
    assert.throws(() => getMonthOverMonthChange(1, Number.POSITIVE_INFINITY), RangeError);
  });
});

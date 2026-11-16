import assert from "node:assert/strict";
import test from "node:test";
import { InstrumentPouchStatus, SterilisationCycleResult } from "@prisma/client";
import { canCreatePouch, canMarkCycleSuccessful, canUsePouch } from "@/features/sterilisation/workflow";

test("a cycle can pass only when both indicators pass", () => {
  assert.equal(canMarkCycleSuccessful({ chemicalIndicatorPass: true, biologicalIndicatorPass: true }), true);
  assert.equal(canMarkCycleSuccessful({ chemicalIndicatorPass: true, biologicalIndicatorPass: false }), false);
  assert.equal(canMarkCycleSuccessful({ chemicalIndicatorPass: false, biologicalIndicatorPass: true }), false);
});

test("pouches can only be created from passed cycles with a non-expired date", () => {
  const today = new Date(2026, 10, 16);
  assert.equal(canCreatePouch(SterilisationCycleResult.PASS, new Date(2026, 10, 16), today), true);
  assert.equal(canCreatePouch(SterilisationCycleResult.FAIL, new Date(2026, 11, 1), today), false);
  assert.equal(canCreatePouch(SterilisationCycleResult.PENDING, new Date(2026, 11, 1), today), false);
  assert.equal(canCreatePouch(SterilisationCycleResult.PASS, new Date(2026, 10, 15), today), false);
});

test("only unexpired sterile pouches can be marked used", () => {
  const today = new Date(2026, 10, 16);
  assert.equal(canUsePouch(InstrumentPouchStatus.STERILE, new Date(2026, 10, 16), today), true);
  assert.equal(canUsePouch(InstrumentPouchStatus.STERILE, new Date(2026, 10, 15), today), false);
  assert.equal(canUsePouch(InstrumentPouchStatus.QUARANTINED, new Date(2026, 11, 1), today), false);
  assert.equal(canUsePouch(InstrumentPouchStatus.USED, new Date(2026, 11, 1), today), false);
});

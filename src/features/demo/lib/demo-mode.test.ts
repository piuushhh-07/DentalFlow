import assert from "node:assert/strict";
import test from "node:test";

import { isLocalDemoEnabled } from "@/features/demo/lib/demo-mode";

test("enables the local demo in development unless explicitly disabled", () => {
  assert.equal(isLocalDemoEnabled("development", "true"), true);
  assert.equal(isLocalDemoEnabled("development", "1"), true);
  assert.equal(isLocalDemoEnabled("development", "yes"), true);
  assert.equal(isLocalDemoEnabled("development", "false"), false);
  assert.equal(isLocalDemoEnabled("development", undefined), true);
  assert.equal(isLocalDemoEnabled("production", "true"), false);
  assert.equal(isLocalDemoEnabled("test", "true"), false);
});

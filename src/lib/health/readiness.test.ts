import assert from "node:assert/strict";
import test from "node:test";

import { evaluateReadiness } from "@/lib/health/readiness";

test("readiness succeeds when the database probe succeeds", async () => {
  const result = await evaluateReadiness(async () => 1);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    status: "ok",
    checks: { database: "ok" },
  });
});

test("readiness fails closed without exposing database error details", async () => {
  const result = await evaluateReadiness(async () => {
    throw new Error("postgres://private-host:5432/secret-database");
  });

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    status: "degraded",
    checks: { database: "unavailable" },
  });
  assert.equal(JSON.stringify(result.body).includes("private-host"), false);
});

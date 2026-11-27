import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchesWhatsAppCronBearerToken } from "./whatsapp-cron-auth";

describe("WhatsApp cron bearer authentication", () => {
  const secret = "a".repeat(32);

  it("accepts the exact configured bearer token", () => {
    assert.equal(
      matchesWhatsAppCronBearerToken(`Bearer ${secret}`, secret),
      true,
    );
  });

  it("rejects a missing or malformed authorization header", () => {
    assert.equal(matchesWhatsAppCronBearerToken(null, secret), false);
    assert.equal(matchesWhatsAppCronBearerToken(secret, secret), false);
    assert.equal(matchesWhatsAppCronBearerToken("Basic abc", secret), false);
  });

  it("rejects incorrect tokens without comparing unequal buffer lengths", () => {
    assert.equal(
      matchesWhatsAppCronBearerToken(`Bearer ${"b".repeat(32)}`, secret),
      false,
    );
    assert.equal(
      matchesWhatsAppCronBearerToken(`Bearer ${"a".repeat(31)}`, secret),
      false,
    );
  });

  it("fails closed when the configured secret is missing or too short", () => {
    assert.equal(matchesWhatsAppCronBearerToken(`Bearer ${secret}`, ""), false);
    assert.equal(
      matchesWhatsAppCronBearerToken(`Bearer ${secret}`, "short"),
      false,
    );
  });
});

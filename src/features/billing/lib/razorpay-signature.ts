import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRazorpayWebhookSignature(
  rawBody: string | Uint8Array,
  signature: string,
  webhookSecret: string,
): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const hmac = createHmac("sha256", webhookSecret);
  if (typeof rawBody === "string") hmac.update(rawBody, "utf8");
  else hmac.update(Buffer.from(rawBody));
  const expected = hmac.digest();
  const received = Buffer.from(signature, "hex");

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function isRazorpayCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "rzp.io";
  } catch {
    return false;
  }
}

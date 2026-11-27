import { timingSafeEqual } from "node:crypto";

const MIN_CRON_SECRET_LENGTH = 32;

export function matchesWhatsAppCronBearerToken(
  authorization: string | null,
  expected: string,
): boolean {
  if (expected.length < MIN_CRON_SECRET_LENGTH) {
    return false;
  }

  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

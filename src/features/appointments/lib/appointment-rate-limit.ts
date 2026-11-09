export const DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT = {
  maxRequests: 3,
  windowMinutes: 60,
} as const;

const MAX_WINDOW_MINUTES = Math.floor(8_640_000_000_000_000 / 60_000);

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) return fallback;

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

export function getPublicAppointmentRateLimitConfig(
  maxRequests: string | undefined,
  windowMinutes: string | undefined,
) {
  return {
    maxRequests: parsePositiveInteger(
      maxRequests,
      DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT.maxRequests,
    ),
    windowMinutes: parsePositiveInteger(
      windowMinutes,
      DEFAULT_PUBLIC_APPOINTMENT_RATE_LIMIT.windowMinutes,
      MAX_WINDOW_MINUTES,
    ),
  };
}

export function isPublicAppointmentRequestRateLimited(
  recentRequestCount: number,
  maxRequests: number,
): boolean {
  return recentRequestCount >= maxRequests;
}

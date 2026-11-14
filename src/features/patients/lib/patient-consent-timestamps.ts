export function resolvePatientEnabledAtTimestamp(
  enabled: boolean,
  wasPreviouslyEnabled: boolean,
  previousTimestamp: Date | null,
  newlyRecordedTimestamp: Date,
): Date | null {
  if (!enabled) return null;
  if (wasPreviouslyEnabled && previousTimestamp) return previousTimestamp;
  return newlyRecordedTimestamp;
}

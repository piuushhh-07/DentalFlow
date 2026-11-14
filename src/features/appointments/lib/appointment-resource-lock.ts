export function getAppointmentResourceLockKeys(
  clinicId: string,
  dentistId: string,
  chairId: string,
): string[] {
  return [
    `${clinicId}:chair:${chairId}`,
    `${clinicId}:dentist:${dentistId}`,
  ].sort();
}

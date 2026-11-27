import type { Prisma } from "@prisma/client";

export type WhatsAppReminderCursor = Readonly<{
  scheduledAt: Date;
  id: string;
}>;

export function buildWhatsAppReminderCursorFilter(
  after?: WhatsAppReminderCursor,
): Prisma.AppointmentWhereInput {
  if (!after) return {};

  return {
    OR: [
      { scheduledAt: { gt: after.scheduledAt } },
      { scheduledAt: after.scheduledAt, id: { gt: after.id } },
    ],
  };
}

export function getWhatsAppReminderPageCursor(
  appointments: readonly WhatsAppReminderCursor[],
): WhatsAppReminderCursor | undefined {
  const lastAppointment = appointments[appointments.length - 1];
  return lastAppointment
    ? {
        scheduledAt: lastAppointment.scheduledAt,
        id: lastAppointment.id,
      }
    : undefined;
}

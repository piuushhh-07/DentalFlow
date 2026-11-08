import { DentistWorkingStatus, StaffJobTitle } from "@prisma/client";
import { z } from "zod";

import { dentistAvailabilitySchema } from "@/features/appointments/lib/appointment-validation";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const dentistProfileSchema = z.object({
  dentistId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  profilePhotoUrl: z
    .union([z.literal(""), z.string().url().max(500)])
    .transform((value) => value || null),
  email: z
    .union([z.literal(""), z.string().trim().email().max(254)])
    .transform((value) => value || null),
  phoneNumber: optionalText(20),
  qualifications: optionalText(500),
  specialization: optionalText(160),
  registrationNumber: optionalText(120),
  registrationCouncil: optionalText(160),
  yearsExperience: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(80)])
    .transform((value) => (value === "" ? null : value)),
  biography: optionalText(3000),
  consultationFee: z
    .union([z.literal(""), z.coerce.number().min(0).max(10000000)])
    .transform((value) => (value === "" ? null : value)),
  workingStatus: z.nativeEnum(DentistWorkingStatus),
  weeklyAvailability: dentistAvailabilitySchema,
});

export const staffProfileSchema = z.object({
  userId: z.string().uuid(),
  jobTitle: z.nativeEnum(StaffJobTitle),
  phoneNumber: optionalText(20),
});

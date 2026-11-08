import assert from "node:assert/strict";
import test from "node:test";
import { DentistWorkingStatus, StaffJobTitle } from "@prisma/client";

import {
  dentistProfileSchema,
  staffProfileSchema,
} from "@/features/team/lib/team-validation";

const weeklyAvailability = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isWorking: dayOfWeek > 0 && dayOfWeek < 6,
  startTime: "09:00",
  endTime: "17:00",
}));

test("validates dentist profiles while allowing unverified registration information", () => {
  const parsed = dentistProfileSchema.safeParse({
    name: "Dr. Example",
    profilePhotoUrl: "",
    email: "doctor@example.test",
    phoneNumber: "+919876543210",
    qualifications: "BDS",
    specialization: "Endodontics",
    registrationNumber: "REG-123",
    registrationCouncil: "State Dental Council",
    yearsExperience: "8",
    biography: "",
    consultationFee: "500",
    workingStatus: DentistWorkingStatus.ACTIVE,
    weeklyAvailability,
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.yearsExperience, 8);
  assert.equal(parsed.success && parsed.data.consultationFee, 500);
});

test("rejects malformed or duplicate weekly dentist availability", () => {
  assert.equal(
    dentistProfileSchema.safeParse({
      name: "Dr. Example",
      profilePhotoUrl: "",
      email: "",
      phoneNumber: "",
      qualifications: "",
      specialization: "",
      registrationNumber: "",
      registrationCouncil: "",
      yearsExperience: "",
      biography: "",
      consultationFee: "",
      workingStatus: DentistWorkingStatus.ACTIVE,
      weeklyAvailability: [...weeklyAvailability, { ...weeklyAvailability[0] }],
    }).success,
    false,
  );
});

test("validates independent staff profile job titles", () => {
  assert.equal(
    staffProfileSchema.safeParse({
      userId: "20000000-0000-4000-8000-000000000001",
      jobTitle: StaffJobTitle.DENTAL_ASSISTANT,
      phoneNumber: "",
    }).success,
    true,
  );
});

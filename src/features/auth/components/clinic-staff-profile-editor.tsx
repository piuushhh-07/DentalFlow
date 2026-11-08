"use client";

import { ClinicPermission, StaffJobTitle } from "@prisma/client";
import { useFormState } from "react-dom";

import {
  initialTeamActionState,
  saveClinicStaffPermissionsAction,
  updateClinicStaffProfileAction,
} from "@/features/team/actions";

const permissionLabels: Record<ClinicPermission, string> = {
  PATIENT_VIEW: "View patients",
  PATIENT_EDIT: "Edit patients",
  APPOINTMENT_MANAGE: "Manage appointments",
  CLINICAL_RECORDS: "Clinical records",
  PRESCRIPTIONS: "Prescriptions",
  TREATMENT_PLANS: "Treatment plans",
  FINANCIAL_RECORDS: "Financial records",
  INSURANCE: "Insurance",
  INVENTORY: "Inventory",
  REPORTS: "Reports",
  STAFF_MANAGE: "Manage staff and dentists",
  CLINIC_SETTINGS: "Clinic settings",
};

const jobTitles: Record<StaffJobTitle, string> = {
  DENTIST: "Dentist",
  RECEPTIONIST: "Receptionist",
  DENTAL_ASSISTANT: "Dental assistant",
  CLINIC_MANAGER: "Clinic manager",
  BILLING_STAFF: "Billing staff",
};

export function ClinicStaffProfileEditor({
  clinicId,
  member,
}: {
  clinicId: string;
  member: {
    userId: string;
    active: boolean;
    permissionsConfigured: boolean;
    permissionGrants: readonly { permission: ClinicPermission }[];
    staffProfile: {
      jobTitle: StaffJobTitle;
      phoneNumber: string | null;
    } | null;
  };
}) {
  const [profileState, profileAction] = useFormState(
    updateClinicStaffProfileAction,
    initialTeamActionState,
  );
  const [permissionState, permissionAction] = useFormState(
    saveClinicStaffPermissionsAction,
    initialTeamActionState,
  );
  const granted = new Set(
    member.permissionGrants.map(({ permission }) => permission),
  );
  const selectedPermissions = member.permissionsConfigured
    ? granted
    : new Set(Object.values(ClinicPermission));

  return (
    <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
      <form action={profileAction} className="space-y-3">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="userId" type="hidden" value={member.userId} />
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Job title
          <select
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-800"
            defaultValue={
              member.staffProfile?.jobTitle ?? StaffJobTitle.RECEPTIONIST
            }
            name="jobTitle"
          >
            {Object.values(StaffJobTitle).map((jobTitle) => (
              <option key={jobTitle} value={jobTitle}>
                {jobTitles[jobTitle]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Phone
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-800"
            defaultValue={member.staffProfile?.phoneNumber ?? ""}
            maxLength={20}
            name="phoneNumber"
            type="tel"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            defaultChecked={member.active}
            name="active"
            type="checkbox"
            value="true"
          />
          Active clinic access
          <input name="active" type="hidden" value="false" />
        </label>
        {profileState.error && (
          <p className="text-sm text-red-700" role="alert">
            {profileState.error}
          </p>
        )}
        {profileState.success && (
          <p className="text-sm text-emerald-800" role="status">
            {profileState.success}
          </p>
        )}
        <button
          className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
          type="submit"
        >
          Save staff details
        </button>
      </form>

      <form action={permissionAction} className="space-y-3">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="userId" type="hidden" value={member.userId} />
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Access permissions
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.values(ClinicPermission).map((permission) => (
              <label
                className="flex items-start gap-2 text-sm text-slate-700"
                key={permission}
              >
                <input
                  className="mt-0.5"
                  defaultChecked={selectedPermissions.has(permission)}
                  name="permissions"
                  type="checkbox"
                  value={permission}
                />
                {permissionLabels[permission]}
              </label>
            ))}
          </div>
          {!member.permissionsConfigured && (
            <p className="mt-2 text-xs text-slate-500">
              Legacy access currently allows all clinic workflows. Save to apply
              these explicit selections.
            </p>
          )}
        </fieldset>
        {permissionState.error && (
          <p className="text-sm text-red-700" role="alert">
            {permissionState.error}
          </p>
        )}
        {permissionState.success && (
          <p className="text-sm text-emerald-800" role="status">
            {permissionState.success}
          </p>
        )}
        <button
          className="h-9 rounded-md bg-teal-800 px-3 text-sm font-semibold text-white hover:bg-teal-900"
          type="submit"
        >
          Save permissions
        </button>
      </form>
    </div>
  );
}

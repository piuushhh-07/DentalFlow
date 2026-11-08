"use client";

import { ClinicPermission, StaffJobTitle } from "@prisma/client";
import { useFormState } from "react-dom";

import { ClinicStaffProfileEditor } from "@/features/auth/components/clinic-staff-profile-editor";
import {
  inviteClinicStaffAction,
  removeClinicStaffAction,
  revokeClinicInvitationAction,
  type ClinicTeamActionState,
} from "@/features/auth/actions";

type TeamMember = Readonly<{
  userId: string;
  role: "OWNER" | "STAFF";
  active: boolean;
  permissionsConfigured: boolean;
  createdAt: Date;
  user: { displayName: string | null; email: string | null };
  staffProfile: {
    jobTitle: StaffJobTitle;
    phoneNumber: string | null;
    active: boolean;
  } | null;
  permissionGrants: readonly { permission: ClinicPermission }[];
}>;
type PendingInvitation = Readonly<{
  id: string;
  email: string;
  role: "OWNER" | "STAFF";
  jobTitle: StaffJobTitle;
  expiresAt: Date;
  createdAt: Date;
}>;

const initialState: ClinicTeamActionState = {};

function InviteForm({ clinicId }: { clinicId: string }) {
  const [state, formAction] = useFormState(
    inviteClinicStaffAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row">
      <input name="clinicId" type="hidden" value={clinicId} />
      <label className="sr-only" htmlFor="staff-email">
        Staff email address
      </label>
      <input
        autoComplete="email"
        className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm"
        id="staff-email"
        maxLength={254}
        name="email"
        placeholder="staff@example.com"
        required
        type="email"
      />
      <label className="sr-only" htmlFor="staff-job-title">
        Staff job title
      </label>
      <select
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
        defaultValue={StaffJobTitle.RECEPTIONIST}
        id="staff-job-title"
        name="jobTitle"
      >
        <option value={StaffJobTitle.DENTIST}>Dentist</option>
        <option value={StaffJobTitle.RECEPTIONIST}>Receptionist</option>
        <option value={StaffJobTitle.DENTAL_ASSISTANT}>Dental assistant</option>
        <option value={StaffJobTitle.CLINIC_MANAGER}>Clinic manager</option>
        <option value={StaffJobTitle.BILLING_STAFF}>Billing staff</option>
      </select>
      <button
        className="h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
        type="submit"
      >
        Invite staff
      </button>
      {state.error && (
        <p className="basis-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="basis-full text-sm text-emerald-800" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}

function MemberRemoval({
  clinicId,
  userId,
}: {
  clinicId: string;
  userId: string;
}) {
  const [state, formAction] = useFormState(
    removeClinicStaffAction,
    initialState,
  );
  return (
    <form action={formAction} className="text-right">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="userId" type="hidden" value={userId} />
      {state.error && (
        <p className="mb-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mb-2 text-sm text-emerald-800" role="status">
          {state.success}
        </p>
      )}
      <button
        className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
        type="submit"
      >
        Remove access
      </button>
    </form>
  );
}

function InvitationRevocation({
  clinicId,
  invitationId,
}: {
  clinicId: string;
  invitationId: string;
}) {
  const [state, formAction] = useFormState(
    revokeClinicInvitationAction,
    initialState,
  );
  return (
    <form action={formAction}>
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="invitationId" type="hidden" value={invitationId} />
      {state.error && (
        <p className="mb-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mb-2 text-sm text-emerald-800" role="status">
          {state.success}
        </p>
      )}
      <button
        className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
        type="submit"
      >
        Revoke
      </button>
    </form>
  );
}

export function ClinicTeamManager({
  clinicId,
  members,
  invitations,
}: {
  clinicId: string;
  members: readonly TeamMember[];
  invitations: readonly PendingInvitation[];
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Invite staff</h2>
        <p className="mb-4 mt-1 text-sm text-slate-600">
          Invitations expire after seven days. The invited person receives
          access only after verifying the invited email address.
        </p>
        <InviteForm clinicId={clinicId} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Clinic members
        </h2>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {members.map((member) => (
            <li
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              key={member.userId}
            >
              <div>
                <p className="font-medium text-slate-900">
                  {member.user.displayName ??
                    member.user.email ??
                    "Clinic member"}
                </p>
                {member.user.displayName && member.user.email && (
                  <p className="text-sm text-slate-600">{member.user.email}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {member.role === "OWNER"
                    ? "Owner · billing, staff, and clinic administration"
                    : `${member.staffProfile?.jobTitle.replaceAll("_", " ") ?? "Staff"} · ${member.active ? "Active access" : "Access deactivated"}`}
                </p>
              </div>
              {member.role === "STAFF" && (
                <MemberRemoval clinicId={clinicId} userId={member.userId} />
              )}
              {member.role === "STAFF" && (
                <details className="basis-full">
                  <summary className="cursor-pointer text-sm font-medium text-teal-800">
                    Edit staff details and permissions
                  </summary>
                  <ClinicStaffProfileEditor
                    clinicId={clinicId}
                    member={member}
                  />
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Pending invitations
        </h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-slate-600">No pending invitations.</p>
        ) : (
          <ul className="space-y-2">
            {invitations.map((invitation) => (
              <li
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={invitation.id}
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {invitation.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {invitation.jobTitle.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Expires{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeZone: "Asia/Kolkata",
                    }).format(invitation.expiresAt)}
                  </p>
                </div>
                <InvitationRevocation
                  clinicId={clinicId}
                  invitationId={invitation.id}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

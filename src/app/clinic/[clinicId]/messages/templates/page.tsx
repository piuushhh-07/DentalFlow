import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicRole } from "@prisma/client";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  getClinicTemplatePreviewPatient,
  getClinicWhatsAppTemplate,
} from "@/features/messages/lib/template-repository";
import { WhatsAppTemplateEditor } from "@/features/messages/components/whatsapp-template-editor";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  formatTemplateDate,
} from "@/features/messages/lib/template-validation";
import { prisma } from "@/lib/db/prisma";

type MessageTemplatesPageProps = Readonly<{
  params: { clinicId: string };
}>;

export const dynamic = "force-dynamic";

export default async function MessageTemplatesPage({
  params,
}: MessageTemplatesPageProps) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(parsedClinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  if (membership.role !== ClinicRole.OWNER) {
    return (
      <AppShell activeSection="templates" clinicId={membership.clinicId}>
        <section className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-semibold text-slate-900">
            Template editing is restricted
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Only an owner of this clinic can edit its WhatsApp message template.
          </p>
          <Link
            className="mt-4 inline-flex text-sm font-medium text-teal-800 underline underline-offset-4"
            href={`/clinic/${membership.clinicId}`}
          >
            Return to the dashboard
          </Link>
        </section>
      </AppShell>
    );
  }

  const [clinic, template, examplePatient] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: membership.clinicId },
      select: { name: true, phoneNumber: true },
    }),
    getClinicWhatsAppTemplate(membership.clinicId),
    getClinicTemplatePreviewPatient(membership.clinicId),
  ]);
  if (!clinic) notFound();

  const treatmentPlan = examplePatient?.treatmentPlans[0];
  const visit = treatmentPlan?.visits[0];
  const dueDate =
    visit?.dueDate ?? examplePatient?.preventiveRecalls[0]?.dueDate;
  const previewValues = {
    patient_name: examplePatient?.fullName ?? "",
    clinic_name: clinic.name,
    treatment_name: treatmentPlan?.name ?? "",
    visit_number: visit?.visitNumber ?? "",
    total_visits: treatmentPlan?.totalVisits ?? "",
    due_date: dueDate ? formatTemplateDate(dueDate) : "",
    clinic_phone: clinic.phoneNumber ?? "our clinic",
  };

  return (
    <AppShell activeSection="templates" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${membership.clinicId}`}
        >
          ← Back to dashboard
        </Link>
        <header className="mt-4">
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            WhatsApp message template
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Edit the clinic&apos;s default reminder message. Values are inserted
            as plain text and saved reminder logs preserve the exact message
            snapshot.
          </p>
        </header>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {examplePatient ? (
            <WhatsAppTemplateEditor
              clinicId={membership.clinicId}
              examplePatientName={examplePatient.fullName}
              initialContent={template?.content ?? DEFAULT_WHATSAPP_TEMPLATE}
              previewValues={previewValues}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <h2 className="font-semibold text-slate-900">
                Add a patient to preview this template
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                A real patient in this clinic is required for the live preview.
                You can still edit and save the template now.
              </p>
              <WhatsAppTemplateEditor
                clinicId={membership.clinicId}
                initialContent={template?.content ?? DEFAULT_WHATSAPP_TEMPLATE}
              />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

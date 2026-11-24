import { notFound, redirect } from "next/navigation";
import { z } from "zod";

export default function ClinicTeamSettingsAlias({
  params,
}: {
  params: { clinicId: string };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

  redirect(`/clinic/${clinicId.data}/settings/staff`);
}

import "server-only";

import {
  Prisma,
  PreventiveRecallStatus,
  TreatmentVisitStatus,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import {
  buildFollowUpPagination,
  type FollowUpQueueItem,
  type FollowUpTab,
  FOLLOW_UP_PAGE_SIZE,
  recallReminderSentTabIncludesRecall,
  treatmentStatusesForTab,
} from "@/features/follow-ups/lib/follow-up-validation";

type DatabaseQueueItem = Readonly<{
  id: string;
  kind: "treatment-visit" | "preventive-recall";
  clinicId: string;
  patientId: string;
  patientName: string;
  phoneNumber: string;
  whatsappOptIn: boolean;
  whatsappOptedInAt: Date | null;
  label: string;
  status: string;
  dueDate: Date;
  treatmentPlanId: string | null;
  visitNumber: number | null;
  totalVisits: number | null;
  reminderSent: boolean;
}>;

function treatmentWhere(
  clinicId: string,
  tab: FollowUpTab | null,
  query: string,
  today: string,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`tv."clinicId" = ${clinicId}::uuid`,
    Prisma.sql`tp."status" <> 'CANCELLED'::"TreatmentPlanStatus"`,
  ];

  if (tab === "due-today") {
    conditions.push(statusesCondition(treatmentStatusesForTab(tab)));
    conditions.push(Prisma.sql`tv."dueDate" = ${today}::date`);
  } else if (tab === "overdue") {
    conditions.push(statusesCondition(treatmentStatusesForTab(tab)));
    conditions.push(Prisma.sql`tv."dueDate" < ${today}::date`);
  } else if (tab === "reminder-sent") {
    conditions.push(Prisma.sql`tv."status" = 'REMINDER_SENT'`);
  } else if (tab === "confirmed") {
    conditions.push(Prisma.sql`tv."status" = 'CONFIRMED'`);
  } else if (tab === "no-response") {
    conditions.push(Prisma.sql`tv."status" = 'NO_RESPONSE'`);
  } else if (tab === "completed") {
    conditions.push(Prisma.sql`tv."status" = 'COMPLETED'`);
  } else {
    conditions.push(Prisma.sql`tv."status" <> 'CANCELLED'`);
  }

  if (query) {
    conditions.push(Prisma.sql`(
      position(lower(${query}) in lower(p."fullName")) > 0 OR
      position(lower(${query}) in lower(p."phoneNumber")) > 0 OR
      position(lower(${query}) in lower(tp."name")) > 0
    )`);
  }

  return Prisma.join(conditions, " AND ");
}

function statusesCondition(
  statuses: readonly TreatmentVisitStatus[],
): Prisma.Sql {
  return Prisma.sql`tv."status"::text IN (${Prisma.join(
    statuses.map((status) => Prisma.sql`${status}`),
  )})`;
}

function recallWhere(
  clinicId: string,
  tab: FollowUpTab | null,
  query: string,
  today: string,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`r."clinicId" = ${clinicId}::uuid`,
  ];

  if (tab === "due-today") {
    conditions.push(Prisma.sql`r."status" = 'ACTIVE'`);
    conditions.push(Prisma.sql`r."dueDate" = ${today}::date`);
  } else if (tab === "overdue") {
    conditions.push(Prisma.sql`r."status" = 'ACTIVE'`);
    conditions.push(Prisma.sql`r."dueDate" < ${today}::date`);
  } else if (tab && recallReminderSentTabIncludesRecall(tab)) {
    conditions.push(Prisma.sql`r."status" = 'ACTIVE'`);
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "message_logs" ml
      WHERE ml."preventiveRecallId" = r."id"
        AND ml."clinicId" = r."clinicId"
        AND ml."patientId" = r."patientId"
        AND ml."status" = 'MANUALLY_RECORDED_SENT'
    )`);
  } else if (tab === "confirmed" || tab === "no-response") {
    conditions.push(Prisma.sql`FALSE`);
  } else if (tab === "completed") {
    conditions.push(Prisma.sql`r."status" = 'COMPLETED'`);
  } else {
    conditions.push(Prisma.sql`r."status" NOT IN ('CANCELLED', 'PAUSED')`);
  }

  if (query) {
    conditions.push(Prisma.sql`(
      position(lower(${query}) in lower(p."fullName")) > 0 OR
      position(lower(${query}) in lower(p."phoneNumber")) > 0 OR
      position(lower(${query}) in lower(COALESCE(r."customName", r."type"::text))) > 0
    )`);
  }

  return Prisma.join(conditions, " AND ");
}

function unionQuery(
  clinicId: string,
  tab: FollowUpTab | null,
  query: string,
  today: string,
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      tv."id"::text AS "id",
      'treatment-visit'::text AS "kind",
      tv."clinicId"::text AS "clinicId",
      tv."patientId"::text AS "patientId",
      p."fullName"::text AS "patientName",
      p."phoneNumber"::text AS "phoneNumber",
      p."whatsappOptIn" AS "whatsappOptIn",
      p."whatsappOptedInAt" AS "whatsappOptedInAt",
      tp."name"::text AS "label",
      tv."status"::text AS "status",
      tv."dueDate"::date AS "dueDate",
      tv."treatmentPlanId"::text AS "treatmentPlanId",
      tv."visitNumber" AS "visitNumber",
      tp."totalVisits" AS "totalVisits",
      false AS "reminderSent"
    FROM "treatment_visits" tv
    JOIN "patients" p
      ON p."id" = tv."patientId" AND p."clinicId" = tv."clinicId"
    JOIN "treatment_plans" tp
      ON tp."id" = tv."treatmentPlanId"
      AND tp."clinicId" = tv."clinicId"
      AND tp."patientId" = tv."patientId"
    WHERE ${treatmentWhere(clinicId, tab, query, today)}

    UNION ALL

    SELECT
      r."id"::text AS "id",
      'preventive-recall'::text AS "kind",
      r."clinicId"::text AS "clinicId",
      r."patientId"::text AS "patientId",
      p."fullName"::text AS "patientName",
      p."phoneNumber"::text AS "phoneNumber",
      p."whatsappOptIn" AS "whatsappOptIn",
      p."whatsappOptedInAt" AS "whatsappOptedInAt",
      CASE r."type"::text
        WHEN 'SIX_MONTH_CHECKUP' THEN 'Six-month checkup'
        WHEN 'CLEANING' THEN 'Cleaning'
        ELSE COALESCE(r."customName", 'Custom recall')
      END::text AS "label",
      r."status"::text AS "status",
      r."dueDate"::date AS "dueDate",
      NULL::text AS "treatmentPlanId",
      NULL::integer AS "visitNumber",
      NULL::integer AS "totalVisits",
      EXISTS (
        SELECT 1 FROM "message_logs" ml
        WHERE ml."preventiveRecallId" = r."id"
          AND ml."clinicId" = r."clinicId"
          AND ml."patientId" = r."patientId"
          AND ml."status" = 'MANUALLY_RECORDED_SENT'
      ) AS "reminderSent"
    FROM "preventive_recalls" r
    JOIN "patients" p
      ON p."id" = r."patientId" AND p."clinicId" = r."clinicId"
    WHERE ${recallWhere(clinicId, tab, query, today)}
  `;
}

export async function listFollowUpQueue(
  clinicId: string,
  tab: FollowUpTab,
  query: string,
  requestedPage: number,
  clinicToday: string,
) {
  const base = unionQuery(clinicId, tab, query, clinicToday);
  const requestedOffset =
    (Math.max(1, requestedPage) - 1) * FOLLOW_UP_PAGE_SIZE;
  const pageRows = await prisma.$queryRaw<
    (DatabaseQueueItem & { totalCount: bigint })[]
>`
    SELECT
      queue_items.*,
      count(*) OVER()::bigint AS "totalCount"
    FROM (${base}) AS queue_items
    ORDER BY "dueDate" ASC, "patientName" ASC, "kind" ASC, "id" ASC
    LIMIT ${FOLLOW_UP_PAGE_SIZE}
    OFFSET ${requestedOffset}
  `;

  // The normal page path reads the page and total count in one round trip.
  // Only an out-of-range page needs a separate count and clamped page fetch.
  let items: DatabaseQueueItem[];
  let pagination: ReturnType<typeof buildFollowUpPagination>;

  if (pageRows.length > 0) {
    pagination = buildFollowUpPagination(
      Number(pageRows[0].totalCount),
      requestedPage,
      FOLLOW_UP_PAGE_SIZE,
    );
    items = pageRows.map(({ totalCount: _totalCount, ...item }) => item);
  } else {
    const countRows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT count(*)::bigint AS "count"
      FROM (${base}) AS queue_items
    `;
    pagination = buildFollowUpPagination(
      Number(countRows[0].count),
      requestedPage,
      FOLLOW_UP_PAGE_SIZE,
    );
    items = await prisma.$queryRaw<DatabaseQueueItem[]>`
      SELECT *
      FROM (${base}) AS queue_items
      ORDER BY "dueDate" ASC, "patientName" ASC, "kind" ASC, "id" ASC
      LIMIT ${pagination.pageSize}
      OFFSET ${pagination.offset}
    `;
  }

  const validatedItems: FollowUpQueueItem[] = items.map((item) => {
    if (
      item.kind === "treatment-visit" &&
      item.treatmentPlanId &&
      item.visitNumber !== null &&
      item.totalVisits !== null
    ) {
      return {
        id: item.id,
        kind: "treatment-visit",
        clinicId: item.clinicId,
        patientId: item.patientId,
        patientName: item.patientName,
        phoneNumber: item.phoneNumber,
        whatsappOptIn: item.whatsappOptIn,
        whatsappOptedInAt: item.whatsappOptedInAt,
        label: item.label,
        status: z.nativeEnum(TreatmentVisitStatus).parse(item.status),
        dueDate: item.dueDate,
        treatmentPlanId: item.treatmentPlanId,
        visitNumber: item.visitNumber,
        totalVisits: item.totalVisits,
        reminderSent: false,
      };
    }
    if (item.kind === "preventive-recall" && item.treatmentPlanId === null) {
      return {
        id: item.id,
        kind: "preventive-recall",
        clinicId: item.clinicId,
        patientId: item.patientId,
        patientName: item.patientName,
        phoneNumber: item.phoneNumber,
        whatsappOptIn: item.whatsappOptIn,
        whatsappOptedInAt: item.whatsappOptedInAt,
        label: item.label,
        status: z.nativeEnum(PreventiveRecallStatus).parse(item.status),
        dueDate: item.dueDate,
        treatmentPlanId: null,
        visitNumber: null,
        totalVisits: null,
        reminderSent: item.reminderSent,
      };
    }
    throw new Error("The follow-up query returned an invalid record shape.");
  });

  return {
    items: validatedItems,
    pagination,
  };
}

export async function getFollowUpSummary(
  clinicId: string,
  clinicToday: string,
) {
  const dueTodayStatuses = treatmentStatusesForTab("due-today");
  const overdueStatuses = treatmentStatusesForTab("overdue");

  const [counts] = await prisma.$queryRaw<
    [
      {
        dueToday: bigint;
        overdue: bigint;
        reminderSent: bigint;
        confirmed: bigint;
        noResponse: bigint;
        completed: bigint;
      },
    ]
  >`
    WITH follow_up_items AS (
      SELECT
        'treatment-visit'::text AS kind,
        tv."status"::text AS status,
        tv."dueDate"::date AS due_date,
        false AS reminder_sent
      FROM "treatment_visits" tv
      JOIN "treatment_plans" tp
        ON tp."id" = tv."treatmentPlanId"
        AND tp."clinicId" = tv."clinicId"
        AND tp."patientId" = tv."patientId"
      WHERE tv."clinicId" = ${clinicId}::uuid
        AND tp."status" <> 'CANCELLED'::"TreatmentPlanStatus"

      UNION ALL

      SELECT
        'preventive-recall'::text AS kind,
        r."status"::text AS status,
        r."dueDate"::date AS due_date,
        EXISTS (
          SELECT 1
          FROM "message_logs" ml
          WHERE ml."preventiveRecallId" = r."id"
            AND ml."clinicId" = r."clinicId"
            AND ml."patientId" = r."patientId"
            AND ml."status" = 'MANUALLY_RECORDED_SENT'
        ) AS reminder_sent
      FROM "preventive_recalls" r
      WHERE r."clinicId" = ${clinicId}::uuid
    )
    SELECT
      COUNT(*) FILTER (
        WHERE
          (kind = 'treatment-visit'
            AND status IN (${Prisma.join(dueTodayStatuses)})
            AND due_date = ${clinicToday}::date)
          OR (kind = 'preventive-recall'
            AND status = 'ACTIVE'
            AND due_date = ${clinicToday}::date)
      )::bigint AS "dueToday",
      COUNT(*) FILTER (
        WHERE
          (kind = 'treatment-visit'
            AND status IN (${Prisma.join(overdueStatuses)})
            AND due_date < ${clinicToday}::date)
          OR (kind = 'preventive-recall'
            AND status = 'ACTIVE'
            AND due_date < ${clinicToday}::date)
      )::bigint AS "overdue",
      COUNT(*) FILTER (
        WHERE
          (kind = 'treatment-visit' AND status = 'REMINDER_SENT')
          OR (kind = 'preventive-recall'
            AND status = 'ACTIVE'
            AND reminder_sent)
      )::bigint AS "reminderSent",
      COUNT(*) FILTER (
        WHERE kind = 'treatment-visit' AND status = 'CONFIRMED'
      )::bigint AS "confirmed",
      COUNT(*) FILTER (
        WHERE kind = 'treatment-visit' AND status = 'NO_RESPONSE'
      )::bigint AS "noResponse",
      COUNT(*) FILTER (
        WHERE status = 'COMPLETED'
      )::bigint AS "completed"
    FROM follow_up_items
  `;

  return {
    "due-today": Number(counts.dueToday),
    overdue: Number(counts.overdue),
    "reminder-sent": Number(counts.reminderSent),
    confirmed: Number(counts.confirmed),
    "no-response": Number(counts.noResponse),
    completed: Number(counts.completed),
  } satisfies Record<FollowUpTab, number>;
}

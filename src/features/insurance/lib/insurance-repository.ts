import "server-only";

import {
  InsuranceActivityType,
  InsuranceClaimStatus,
  InsuranceDocumentStatus,
  InsuranceDocumentExtractionStatus,
  InsurancePaymentKind,
  InsurancePreAuthorizationStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  insuranceClaimSummarySourcesSchema,
  insuranceDocumentExtractionSchema,
  insuranceExtractionFieldsSchema,
  validateInsuranceClaimSummary,
  type InsuranceExtractionFields,
} from "@/features/insurance/lib/insurance-document-ai";
import {
  calculateOutstandingPaise,
  formatPaise,
  isPolicyUsableOn,
  validateClaimTransition,
  validatePreAuthorizationTransition,
  type ClaimTransitionContext,
} from "@/features/insurance/lib/insurance-validation";

const PAGE_SIZE = 20;
const IN_PROGRESS_CLAIM_STATUSES = [
  InsuranceClaimStatus.SUBMITTED,
  InsuranceClaimStatus.UNDER_REVIEW,
  InsuranceClaimStatus.NEEDS_DOCUMENTS,
  InsuranceClaimStatus.APPROVED,
  InsuranceClaimStatus.PARTIALLY_APPROVED,
] as const;

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function clinicDateStart(value: string): Date {
  return new Date(`${value}T00:00:00+05:30`);
}

function nextCalendarDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function lockClaim(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  claimId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id"
    FROM public.insurance_claims
    WHERE "id" = ${claimId}::uuid
      AND "clinicId" = ${clinicId}::uuid
    FOR UPDATE
  `;
}

async function lockPreAuthorization(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  preAuthorizationId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id"
    FROM public.insurance_pre_authorizations
    WHERE "id" = ${preAuthorizationId}::uuid
      AND "clinicId" = ${clinicId}::uuid
    FOR UPDATE
  `;
}

async function lockDocument(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  claimId: string,
  documentId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id"
    FROM public.insurance_documents
    WHERE "id" = ${documentId}::uuid
      AND "claimId" = ${claimId}::uuid
      AND "clinicId" = ${clinicId}::uuid
    FOR UPDATE
  `;
}

function addActivity(
  transaction: Prisma.TransactionClient,
  input: {
    clinicId: string;
    actorUserId: string;
    type: InsuranceActivityType;
    summary: string;
    claimId?: string;
    preAuthorizationId?: string;
    details?: Prisma.InputJsonValue;
  },
) {
  return transaction.insuranceActivity.create({
    data: {
      clinicId: input.clinicId,
      actorUserId: input.actorUserId,
      claimId: input.claimId,
      preAuthorizationId: input.preAuthorizationId,
      type: input.type,
      summary: input.summary,
      details: input.details,
    },
  });
}

export async function saveInsuranceClaimSummaryDraft(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  input: {
    summary: string;
    fields: InsuranceExtractionFields;
    sourceDocumentId: string | null;
  },
) {
  return prisma.$transaction(async (transaction) => {
    await lockClaim(transaction, clinicId, claimId);
    const claim = await transaction.insuranceClaim.findFirst({
      where: { id: claimId, clinicId },
      include: {
        patient: { select: { fullName: true } },
        policy: {
          include: { provider: { select: { name: true } } },
        },
      },
    });
    if (!claim) throw new InsuranceRecordNotFoundError();

    let sourceReferences: Prisma.InputJsonValue = [];
    if (input.sourceDocumentId) {
      const document = await transaction.insuranceDocument.findFirst({
        where: {
          id: input.sourceDocumentId,
          clinicId,
          claimId,
          extractionStatus: InsuranceDocumentExtractionStatus.NEEDS_REVIEW,
          extractionData: { not: Prisma.DbNull },
        },
        select: { extractionData: true },
      });
      const parsedExtraction = insuranceDocumentExtractionSchema.safeParse(
        document?.extractionData,
      );
      if (!document || !parsedExtraction.success) {
        throw new InsuranceRecordNotFoundError();
      }
      sourceReferences = parsedExtraction.data.sources.map((source) => ({
        ...source,
        documentId: input.sourceDocumentId!,
      }));
    }

    const expectedFields = {
      patientName: claim.patient.fullName,
      providerName: claim.policy.provider.name,
      policyNumber: claim.policy.policyNumber,
      policyValidFrom: claim.policy.validFrom.toISOString().slice(0, 10),
      policyValidUntil: claim.policy.validUntil.toISOString().slice(0, 10),
      treatmentDate: claim.treatmentDate.toISOString().slice(0, 10),
      estimatedCost: claim.estimatedCost.toFixed(2),
      amountClaimed: claim.amountClaimed.toFixed(2),
    };
    const issues = validateInsuranceClaimSummary(input.fields, expectedFields);
    if (issues.length > 0) {
      throw new InsuranceValidationError(issues.join(" "));
    }

    await transaction.insuranceClaim.updateMany({
      where: { id: claimId, clinicId },
      data: {
        claimSummary: input.summary,
        claimSummaryFields: input.fields,
        claimSummarySources: sourceReferences,
        summaryReviewedAt: null,
        summaryReviewedById: null,
      },
    });
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.CLAIM_SUMMARY_UPDATED,
      summary: "Draft claim summary saved for staff review",
      details: {
        sourceDocumentId: input.sourceDocumentId,
        sourceCount: Array.isArray(sourceReferences)
          ? sourceReferences.length
          : 0,
      },
    });
  });
}

export async function reviewInsuranceClaimSummary(
  clinicId: string,
  actorUserId: string,
  claimId: string,
) {
  return prisma.$transaction(async (transaction) => {
    await lockClaim(transaction, clinicId, claimId);
    const claim = await transaction.insuranceClaim.findFirst({
      where: { id: claimId, clinicId },
      include: {
        patient: { select: { fullName: true } },
        policy: {
          include: { provider: { select: { name: true } } },
        },
      },
    });
    if (!claim) throw new InsuranceRecordNotFoundError();
    const fieldsResult = insuranceExtractionFieldsSchema.safeParse(
      claim.claimSummaryFields,
    );
    const sourcesResult = insuranceClaimSummarySourcesSchema.safeParse(
      claim.claimSummarySources ?? [],
    );
    if (
      !claim.claimSummary?.trim() ||
      !fieldsResult.success ||
      !sourcesResult.success
    ) {
      throw new InsuranceValidationError(
        "Save a complete claim summary before marking it reviewed.",
      );
    }

    const expectedFields = {
      patientName: claim.patient.fullName,
      providerName: claim.policy.provider.name,
      policyNumber: claim.policy.policyNumber,
      policyValidFrom: claim.policy.validFrom.toISOString().slice(0, 10),
      policyValidUntil: claim.policy.validUntil.toISOString().slice(0, 10),
      treatmentDate: claim.treatmentDate.toISOString().slice(0, 10),
      estimatedCost: claim.estimatedCost.toFixed(2),
      amountClaimed: claim.amountClaimed.toFixed(2),
    };
    const issues = validateInsuranceClaimSummary(
      fieldsResult.data,
      expectedFields,
    );
    if (issues.length > 0) {
      throw new InsuranceValidationError(issues.join(" "));
    }

    const sourceIds = Array.from(
      new Set(sourcesResult.data.map((source) => source.documentId)),
    );
    if (sourceIds.length > 0) {
      const documents = await transaction.insuranceDocument.findMany({
        where: {
          id: { in: sourceIds },
          clinicId,
          claimId,
          extractionStatus: InsuranceDocumentExtractionStatus.NEEDS_REVIEW,
        },
        select: { id: true, extractionData: true },
      });
      if (documents.length !== sourceIds.length) {
        throw new InsuranceValidationError(
          "A cited source document is no longer available for review.",
        );
      }
      const extractionByDocument = new Map(
        documents.map((document) => [
          document.id,
          insuranceDocumentExtractionSchema.safeParse(document.extractionData),
        ]),
      );
      for (const reference of sourcesResult.data) {
        const extraction = extractionByDocument.get(reference.documentId);
        if (
          !extraction?.success ||
          !extraction.data.sources.some(
            (source) =>
              source.field === reference.field &&
              source.page === reference.page &&
              source.quote === reference.quote,
          )
        ) {
          throw new InsuranceValidationError(
            "A source-page reference no longer matches its extracted document.",
          );
        }
      }
    }

    const reviewedAt = new Date();
    await transaction.insuranceClaim.updateMany({
      where: { id: claimId, clinicId },
      data: {
        summaryReviewedAt: reviewedAt,
        summaryReviewedById: actorUserId,
      },
    });
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.CLAIM_SUMMARY_REVIEWED,
      summary: "Claim summary reviewed by clinic staff",
      details: { sourceCount: sourcesResult.data.length },
    });
  });
}

export class InsuranceRecordNotFoundError extends Error {
  constructor() {
    super("The insurance record is not available in this clinic.");
    this.name = "InsuranceRecordNotFoundError";
  }
}

export class InsuranceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsuranceValidationError";
  }
}

export async function listInsuranceProviders(clinicId: string, query = "") {
  return prisma.insuranceProvider.findMany({
    where: {
      clinicId,
      ...(query
        ? { name: { contains: query, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      phoneNumber: true,
      email: true,
      website: true,
      archivedAt: true,
      _count: { select: { policies: true } },
    },
  });
}

export async function listInsuranceProvidersPage(
  clinicId: string,
  query: string,
  requestedPage: number,
) {
  const where: Prisma.InsuranceProviderWhereInput = {
    clinicId,
    ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
  };
  const totalCount = await prisma.insuranceProvider.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const providers = await prisma.insuranceProvider.findMany({
    where,
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      kind: true,
      phoneNumber: true,
      email: true,
      archivedAt: true,
      _count: { select: { policies: true } },
    },
  });
  return {
    providers,
    pagination: {
      page,
      totalPages,
      totalCount,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

export async function getInsuranceProvider(
  clinicId: string,
  providerId: string,
) {
  return prisma.insuranceProvider.findFirst({
    where: { id: providerId, clinicId },
  });
}

export async function createInsuranceProvider(
  clinicId: string,
  input: Prisma.InsuranceProviderCreateWithoutClinicInput,
) {
  return prisma.insuranceProvider.create({
    data: { ...input, clinic: { connect: { id: clinicId } } },
    select: { id: true },
  });
}

export async function updateInsuranceProvider(
  clinicId: string,
  providerId: string,
  input: Omit<Prisma.InsuranceProviderUpdateInput, "clinic">,
) {
  const result = await prisma.insuranceProvider.updateMany({
    where: { id: providerId, clinicId, archivedAt: null },
    data: input,
  });
  return result.count > 0;
}

export async function archiveInsuranceProvider(
  clinicId: string,
  providerId: string,
) {
  const result = await prisma.insuranceProvider.updateMany({
    where: { id: providerId, clinicId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function listInsurancePatients(
  clinicId: string,
  query = "",
  patientId?: string,
) {
  return prisma.patient.findMany({
    where: {
      clinicId,
      ...(patientId ? { id: patientId } : {}),
      ...(query
        ? {
            OR: [
              { fullName: { contains: query, mode: "insensitive" } },
              { normalizedPhone: { contains: query.replace(/\D/g, "") } },
            ],
          }
        : {}),
    },
    orderBy: { fullName: "asc" },
    take: 100,
    select: { id: true, fullName: true, phoneNumber: true },
  });
}

export async function listInsurancePlansForPatient(
  clinicId: string,
  patientId: string,
) {
  return prisma.treatmentPlan.findMany({
    where: { clinicId, patientId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, totalVisits: true },
  });
}

export async function listInsurancePolicies(
  clinicId: string,
  query = "",
  patientId?: string,
) {
  return prisma.insurancePolicy.findMany({
    where: {
      clinicId,
      ...(patientId ? { patientId } : {}),
      ...(query
        ? {
            OR: [
              {
                patient: { fullName: { contains: query, mode: "insensitive" } },
              },
              { provider: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ validUntil: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      patientId: true,
      policyNumber: true,
      validFrom: true,
      validUntil: true,
      coverageLimit: true,
      deductible: true,
      coPaymentPercent: true,
      exclusions: true,
      coverageNotes: true,
      patient: { select: { id: true, fullName: true } },
      provider: { select: { id: true, name: true, kind: true } },
    },
  });
}

export async function listInsurancePoliciesPage(
  clinicId: string,
  query: string,
  requestedPage: number,
) {
  const where: Prisma.InsurancePolicyWhereInput = {
    clinicId,
    ...(query
      ? {
          OR: [
            { patient: { fullName: { contains: query, mode: "insensitive" } } },
            { provider: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const totalCount = await prisma.insurancePolicy.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const policies = await prisma.insurancePolicy.findMany({
    where,
    orderBy: [{ validUntil: "asc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      patientId: true,
      policyNumber: true,
      validFrom: true,
      validUntil: true,
      coverageLimit: true,
      deductible: true,
      coPaymentPercent: true,
      exclusions: true,
      coverageNotes: true,
      patient: { select: { id: true, fullName: true } },
      provider: { select: { id: true, name: true } },
    },
  });
  return {
    policies,
    pagination: {
      page,
      totalPages,
      totalCount,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

export async function createInsurancePolicy(
  clinicId: string,
  input: {
    patientId: string;
    providerId: string;
    policyNumber: string;
    memberReference: string | null;
    validFrom: string;
    validUntil: string;
    coverageLimit: string | null;
    deductible: string | null;
    coPaymentPercent: string | null;
    exclusions: string | null;
    coverageNotes: string | null;
  },
) {
  const [patient, provider] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: input.patientId, clinicId },
      select: { id: true },
    }),
    prisma.insuranceProvider.findFirst({
      where: { id: input.providerId, clinicId, archivedAt: null },
      select: { id: true },
    }),
  ]);
  if (!patient || !provider) throw new InsuranceRecordNotFoundError();
  return prisma.insurancePolicy.create({
    data: {
      clinicId,
      patientId: patient.id,
      providerId: provider.id,
      policyNumber: input.policyNumber,
      memberReference: input.memberReference,
      validFrom: databaseDate(input.validFrom),
      validUntil: databaseDate(input.validUntil),
      coverageLimit: input.coverageLimit
        ? new Prisma.Decimal(input.coverageLimit)
        : null,
      deductible: input.deductible
        ? new Prisma.Decimal(input.deductible)
        : null,
      coPaymentPercent: input.coPaymentPercent
        ? new Prisma.Decimal(input.coPaymentPercent)
        : null,
      exclusions: input.exclusions,
      coverageNotes: input.coverageNotes,
    },
    select: { id: true },
  });
}

export async function createInsuranceClaim(
  clinicId: string,
  actorUserId: string,
  input: {
    patientId: string;
    policyId: string;
    treatmentPlanId: string | null;
    preAuthorizationId: string | null;
    type: "CASHLESS" | "REIMBURSEMENT";
    treatmentDetails: string;
    treatmentDate: string;
    estimatedCost: string;
    amountClaimed: string;
    claimReference: string | null;
    notes: string | null;
  },
) {
  return prisma.$transaction(
    async (transaction) => {
      const policy = await transaction.insurancePolicy.findFirst({
        where: {
          id: input.policyId,
          clinicId,
          patientId: input.patientId,
        },
        select: {
          id: true,
          validFrom: true,
          validUntil: true,
          patientId: true,
        },
      });
      if (!policy) throw new InsuranceRecordNotFoundError();

      const treatmentDate = input.treatmentDate;
      const validFrom = policy.validFrom.toISOString().slice(0, 10);
      const validUntil = policy.validUntil.toISOString().slice(0, 10);
      if (!isPolicyUsableOn(validFrom, validUntil, treatmentDate)) {
        throw new InsuranceValidationError(
          "The selected policy was not valid on the treatment date. Verify the policy dates before continuing.",
        );
      }

      const treatmentPlanId = input.treatmentPlanId;
      if (treatmentPlanId) {
        const plan = await transaction.treatmentPlan.findFirst({
          where: {
            id: treatmentPlanId,
            clinicId,
            patientId: input.patientId,
          },
          select: { id: true },
        });
        if (!plan) throw new InsuranceRecordNotFoundError();
      }

      const preAuthorizationId = input.preAuthorizationId;
      if (preAuthorizationId) {
        const preAuthorization =
          await transaction.insurancePreAuthorization.findFirst({
            where: {
              id: preAuthorizationId,
              clinicId,
              patientId: input.patientId,
              policyId: input.policyId,
              status: {
                in: [
                  InsurancePreAuthorizationStatus.APPROVED,
                  InsurancePreAuthorizationStatus.PARTIALLY_APPROVED,
                ],
              },
            },
            select: { id: true, expiresAt: true },
          });
        if (!preAuthorization) throw new InsuranceRecordNotFoundError();
        if (
          preAuthorization.expiresAt &&
          preAuthorization.expiresAt.getTime() < Date.now()
        ) {
          throw new InsuranceValidationError(
            "The linked pre-authorization has expired.",
          );
        }
      }

      const claim = await transaction.insuranceClaim.create({
        data: {
          clinicId,
          patientId: input.patientId,
          policyId: input.policyId,
          treatmentPlanId: input.treatmentPlanId,
          preAuthorizationId: input.preAuthorizationId,
          type: input.type,
          treatmentDetails: input.treatmentDetails,
          treatmentDate: databaseDate(treatmentDate),
          estimatedCost: new Prisma.Decimal(input.estimatedCost),
          amountClaimed: new Prisma.Decimal(input.amountClaimed),
          claimReference: input.claimReference,
          notes: input.notes,
        },
        select: { id: true },
      });

      const requiredTypes =
        input.type === "REIMBURSEMENT"
          ? ["CLAIM_FORM", "POLICY_COPY", "INVOICE"]
          : ["CLAIM_FORM", "POLICY_COPY", "TREATMENT_ESTIMATE"];
      await transaction.insuranceDocument.createMany({
        data: requiredTypes.map((type) => ({
          clinicId,
          claimId: claim.id,
          type: type as
            "CLAIM_FORM" | "POLICY_COPY" | "INVOICE" | "TREATMENT_ESTIMATE",
          name: type.replaceAll("_", " ").toLowerCase(),
        })),
      });

      const activityData: Prisma.InsuranceActivityCreateManyInput[] = [
        {
          clinicId,
          actorUserId,
          claimId: claim.id,
          type: InsuranceActivityType.CLAIM_CREATED,
          summary: `${input.type === "CASHLESS" ? "Cashless" : "Reimbursement"} claim created`,
          details: {
            type: input.type,
            status: InsuranceClaimStatus.DRAFT,
          },
        },
        ...requiredTypes.map((type) => ({
          clinicId,
          actorUserId,
          claimId: claim.id,
          type: InsuranceActivityType.DOCUMENT_REQUIRED,
          summary: `Required document added: ${type.replaceAll("_", " ").toLowerCase()}`,
        })),
      ];
      await transaction.insuranceActivity.createMany({
        data: activityData,
      });
      return claim;
    },
    { timeout: 10_000 },
  );
}

export async function updateInsuranceClaimDetails(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  input: {
    treatmentDetails: string;
    treatmentDate: string;
    estimatedCost: string;
    amountClaimed: string;
    claimReference: string | null;
    notes: string | null;
  },
) {
  return prisma.$transaction(async (transaction) => {
    await lockClaim(transaction, clinicId, claimId);
    const claim = await transaction.insuranceClaim.findFirst({
      where: { id: claimId, clinicId },
      select: {
        id: true,
        patientId: true,
        policyId: true,
        status: true,
        treatmentDate: true,
        estimatedCost: true,
        amountClaimed: true,
      },
    });
    if (!claim) throw new InsuranceRecordNotFoundError();
    const editableStatuses: InsuranceClaimStatus[] = [
      InsuranceClaimStatus.DRAFT,
      InsuranceClaimStatus.NEEDS_DOCUMENTS,
      InsuranceClaimStatus.REJECTED,
    ];
    if (!editableStatuses.includes(claim.status)) {
      throw new InsuranceValidationError(
        "Only draft, rejected, or document-pending claims can be edited.",
      );
    }
    const policy = await transaction.insurancePolicy.findFirst({
      where: {
        id: claim.policyId,
        clinicId,
        patientId: claim.patientId,
      },
      select: { validFrom: true, validUntil: true },
    });
    if (
      !policy ||
      !isPolicyUsableOn(
        policy.validFrom.toISOString().slice(0, 10),
        policy.validUntil.toISOString().slice(0, 10),
        input.treatmentDate,
      )
    ) {
      throw new InsuranceValidationError(
        "The policy is not valid on the treatment date.",
      );
    }
    const patientPayments = await transaction.insurancePayment.aggregate({
      where: {
        clinicId,
        claimId: claim.id,
        kind: InsurancePaymentKind.PATIENT_PAYMENT,
      },
      _sum: { amount: true },
    });
    if (
      patientPayments._sum.amount &&
      patientPayments._sum.amount.gt(input.amountClaimed)
    ) {
      throw new InsuranceValidationError(
        "The amount claimed cannot be reduced below recorded patient payments.",
      );
    }
    await transaction.insuranceClaim.updateMany({
      where: { id: claim.id, clinicId },
      data: {
        treatmentDetails: input.treatmentDetails,
        treatmentDate: databaseDate(input.treatmentDate),
        estimatedCost: new Prisma.Decimal(input.estimatedCost),
        amountClaimed: new Prisma.Decimal(input.amountClaimed),
        claimReference: input.claimReference,
        notes: input.notes,
        ...(claim.status === InsuranceClaimStatus.REJECTED
          ? { amountApproved: null }
          : {}),
      },
    });
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.CLAIM_UPDATED,
      summary: "Claim details updated",
      details: {
        previousTreatmentDate: claim.treatmentDate.toISOString().slice(0, 10),
        nextTreatmentDate: input.treatmentDate,
        previousEstimatedCost: claim.estimatedCost.toString(),
        nextEstimatedCost: input.estimatedCost,
        previousAmountClaimed: claim.amountClaimed.toString(),
        nextAmountClaimed: input.amountClaimed,
      },
    });
  });
}

export async function updateInsuranceClaimStatus(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  input: {
    status: (typeof InsuranceClaimStatus)[keyof typeof InsuranceClaimStatus];
    approvedAmount: string | null;
    rejectionReason: string | null;
  },
) {
  await prisma.$transaction(
    async (transaction) => {
      await lockClaim(transaction, clinicId, claimId);
      const claim = await transaction.insuranceClaim.findFirst({
        where: { id: claimId, clinicId },
        include: {
          payments: { select: { kind: true, amount: true } },
          documents: { select: { status: true } },
        },
      });
      if (!claim) throw new InsuranceRecordNotFoundError();
      const patientPaid = claim.payments
        .filter(
          (payment) => payment.kind === InsurancePaymentKind.PATIENT_PAYMENT,
        )
        .reduce(
          (total, payment) => total.plus(payment.amount),
          new Prisma.Decimal(0),
        )
        .toString();
      const insurerPaid = claim.payments
        .filter(
          (payment) => payment.kind === InsurancePaymentKind.INSURER_PAYMENT,
        )
        .reduce(
          (total, payment) => total.plus(payment.amount),
          new Prisma.Decimal(0),
        )
        .toString();
      const context: ClaimTransitionContext = {
        claimType: claim.type,
        amountClaimed: claim.amountClaimed.toString(),
        amountApproved: claim.amountApproved?.toString() ?? null,
        patientPaid,
        insurerPaid,
        hasRequiredDocuments: claim.documents.every(
          ({ status }) =>
            status !== InsuranceDocumentStatus.REQUIRED &&
            status !== InsuranceDocumentStatus.REJECTED,
        ),
      };
      const issue = validateClaimTransition(
        claim.status,
        input.status,
        context,
        input.approvedAmount,
        input.rejectionReason,
      );
      if (issue) throw new InsuranceValidationError(issue);

      const now = new Date();
      await transaction.insuranceClaim.updateMany({
        where: { id: claim.id, clinicId },
        data: {
          status: input.status,
          amountApproved:
            input.status === InsuranceClaimStatus.APPROVED ||
            input.status === InsuranceClaimStatus.PARTIALLY_APPROVED
              ? new Prisma.Decimal(input.approvedAmount!)
              : input.status === InsuranceClaimStatus.SUBMITTED
                ? null
                : claim.amountApproved,
          rejectionReason:
            input.status === InsuranceClaimStatus.REJECTED
              ? input.rejectionReason
              : input.status === InsuranceClaimStatus.SUBMITTED
                ? null
                : claim.rejectionReason,
          ...(input.status === InsuranceClaimStatus.SUBMITTED
            ? {
                submittedAt: now,
                resubmissionCount:
                  claim.status === InsuranceClaimStatus.REJECTED
                    ? { increment: 1 }
                    : claim.resubmissionCount,
              }
            : {}),
          ...(input.status === InsuranceClaimStatus.APPROVED ||
          input.status === InsuranceClaimStatus.PARTIALLY_APPROVED ||
          input.status === InsuranceClaimStatus.REJECTED
            ? { insurerRespondedAt: now }
            : {}),
        },
      });
      await addActivity(transaction, {
        clinicId,
        actorUserId,
        claimId,
        type: InsuranceActivityType.STATUS_CHANGED,
        summary: `Claim status changed: ${claim.status} → ${input.status}`,
        details: {
          from: claim.status,
          to: input.status,
          approvedAmount: input.approvedAmount,
          rejectionReason: input.rejectionReason,
        },
      });
    },
    { timeout: 10_000 },
  );
}

export async function scheduleInsuranceFollowUp(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  followUpAt: Date | null,
) {
  return prisma.$transaction(async (transaction) => {
    const result = await transaction.insuranceClaim.updateMany({
      where: {
        id: claimId,
        clinicId,
        status: {
          notIn: [InsuranceClaimStatus.CLOSED, InsuranceClaimStatus.PAID],
        },
      },
      data: { followUpAt },
    });
    if (!result.count) throw new InsuranceRecordNotFoundError();
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.FOLLOW_UP_SCHEDULED,
      summary: followUpAt
        ? `Follow-up scheduled for ${followUpAt.toISOString()}`
        : "Follow-up reminder cleared",
    });
  });
}

export async function createInsurancePayment(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  input: {
    kind: (typeof InsurancePaymentKind)[keyof typeof InsurancePaymentKind];
    amount: string;
    paidAt: Date;
    reference: string | null;
    notes: string | null;
  },
) {
  return prisma.$transaction(
    async (transaction) => {
      await lockClaim(transaction, clinicId, claimId);
      const claim = await transaction.insuranceClaim.findFirst({
        where: { id: claimId, clinicId },
        include: {
          payments: { select: { kind: true, amount: true } },
        },
      });
      if (!claim) throw new InsuranceRecordNotFoundError();
      if (claim.status === InsuranceClaimStatus.CLOSED) {
        throw new InsuranceValidationError(
          "Payments cannot be recorded on a closed claim.",
        );
      }
      if (input.kind === InsurancePaymentKind.PATIENT_PAYMENT) {
        const paid = claim.payments
          .filter(
            (payment) => payment.kind === InsurancePaymentKind.PATIENT_PAYMENT,
          )
          .reduce(
            (total, payment) => total.plus(payment.amount),
            new Prisma.Decimal(0),
          );
        if (paid.plus(input.amount).gt(claim.amountClaimed)) {
          throw new InsuranceValidationError(
            "Patient payments cannot exceed the amount claimed.",
          );
        }
      }
      if (input.kind === InsurancePaymentKind.INSURER_PAYMENT) {
        if (!claim.amountApproved || claim.amountApproved.lte(0)) {
          throw new InsuranceValidationError(
            "Record an insurer decision before recording insurer payments.",
          );
        }
        const paid = claim.payments
          .filter(
            (payment) => payment.kind === InsurancePaymentKind.INSURER_PAYMENT,
          )
          .reduce(
            (total, payment) => total.plus(payment.amount),
            new Prisma.Decimal(0),
          );
        const nextTotal = paid.plus(input.amount);
        if (nextTotal.gt(claim.amountApproved)) {
          throw new InsuranceValidationError(
            "Insurer payments cannot exceed the approved amount.",
          );
        }
      }
      const payment = await transaction.insurancePayment.create({
        data: {
          clinicId,
          claimId,
          recordedById: actorUserId,
          kind: input.kind,
          amount: new Prisma.Decimal(input.amount),
          paidAt: input.paidAt,
          reference: input.reference,
          notes: input.notes,
        },
        select: { id: true },
      });
      await addActivity(transaction, {
        clinicId,
        actorUserId,
        claimId,
        type: InsuranceActivityType.PAYMENT_RECORDED,
        summary: `${input.kind === InsurancePaymentKind.INSURER_PAYMENT ? "Insurer" : "Patient"} payment recorded`,
        details: {
          kind: input.kind,
          amount: input.amount,
          paidAt: input.paidAt.toISOString(),
        },
      });
      if (
        input.kind === InsurancePaymentKind.INSURER_PAYMENT &&
        claim.amountApproved &&
        claim.status !== InsuranceClaimStatus.PAID
      ) {
        const insurerPayments = claim.payments
          .filter((row) => row.kind === InsurancePaymentKind.INSURER_PAYMENT)
          .map((row) => row.amount.toString());
        insurerPayments.push(input.amount);
        if (
          calculateOutstandingPaise(
            claim.amountApproved.toString(),
            insurerPayments,
          ) === BigInt(0)
        ) {
          await transaction.insuranceClaim.updateMany({
            where: { id: claimId, clinicId },
            data: { status: InsuranceClaimStatus.PAID },
          });
          await addActivity(transaction, {
            clinicId,
            actorUserId,
            claimId,
            type: InsuranceActivityType.STATUS_CHANGED,
            summary:
              "Claim marked paid after full insurer payment was recorded",
            details: { from: claim.status, to: InsuranceClaimStatus.PAID },
          });
        }
      }
      return payment;
    },
    { timeout: 10_000 },
  );
}

export async function createInsurancePreAuthorization(
  clinicId: string,
  actorUserId: string,
  input: {
    patientId: string;
    policyId: string;
    treatmentPlanId: string | null;
    proposedTreatment: string;
    estimatedCost: string;
    requestReference: string | null;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const policy = await transaction.insurancePolicy.findFirst({
      where: { id: input.policyId, clinicId, patientId: input.patientId },
      select: { id: true, validFrom: true, validUntil: true },
    });
    if (!policy) throw new InsuranceRecordNotFoundError();
    const clinic = await transaction.clinic.findUnique({
      where: { id: clinicId },
      select: { timeZone: true },
    });
    if (!clinic) throw new InsuranceRecordNotFoundError();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: clinic.timeZone,
    }).format(new Date());
    if (
      !isPolicyUsableOn(
        policy.validFrom.toISOString().slice(0, 10),
        policy.validUntil.toISOString().slice(0, 10),
        today,
      )
    ) {
      throw new InsuranceValidationError(
        "This policy is not currently valid for a pre-authorization request.",
      );
    }
    if (input.treatmentPlanId) {
      const plan = await transaction.treatmentPlan.findFirst({
        where: {
          id: input.treatmentPlanId,
          clinicId,
          patientId: input.patientId,
        },
        select: { id: true },
      });
      if (!plan) throw new InsuranceRecordNotFoundError();
    }
    const preAuthorization = await transaction.insurancePreAuthorization.create(
      {
        data: {
          clinicId,
          patientId: input.patientId,
          policyId: input.policyId,
          treatmentPlanId: input.treatmentPlanId,
          proposedTreatment: input.proposedTreatment,
          estimatedCost: new Prisma.Decimal(input.estimatedCost),
          requestReference: input.requestReference,
        },
        select: { id: true },
      },
    );
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      preAuthorizationId: preAuthorization.id,
      type: InsuranceActivityType.PREAUTH_CREATED,
      summary: "Pre-authorization request created as a draft",
      details: { status: InsurancePreAuthorizationStatus.DRAFT },
    });
    return preAuthorization;
  });
}

export async function updateInsurancePreAuthorizationStatus(
  clinicId: string,
  actorUserId: string,
  preAuthorizationId: string,
  input: {
    status: (typeof InsurancePreAuthorizationStatus)[keyof typeof InsurancePreAuthorizationStatus];
    approvedAmount: string | null;
    conditions: string | null;
    expiresAt: Date | null;
    rejectionReason: string | null;
  },
) {
  return prisma.$transaction(async (transaction) => {
    await lockPreAuthorization(transaction, clinicId, preAuthorizationId);
    const preAuthorization =
      await transaction.insurancePreAuthorization.findFirst({
        where: { id: preAuthorizationId, clinicId },
      });
    if (!preAuthorization) throw new InsuranceRecordNotFoundError();
    const issue = validatePreAuthorizationTransition(
      preAuthorization.status,
      input.status,
      preAuthorization.estimatedCost.toString(),
      input.approvedAmount,
      input.rejectionReason,
    );
    if (issue) throw new InsuranceValidationError(issue);
    const now = new Date();
    await transaction.insurancePreAuthorization.updateMany({
      where: { id: preAuthorizationId, clinicId },
      data: {
        status: input.status,
        ...(input.status === InsurancePreAuthorizationStatus.SUBMITTED
          ? { submittedAt: now }
          : {}),
        ...(input.status === InsurancePreAuthorizationStatus.APPROVED ||
        input.status === InsurancePreAuthorizationStatus.PARTIALLY_APPROVED ||
        input.status === InsurancePreAuthorizationStatus.REJECTED
          ? { decidedAt: now }
          : {}),
        approvedAmount:
          input.status === InsurancePreAuthorizationStatus.APPROVED ||
          input.status === InsurancePreAuthorizationStatus.PARTIALLY_APPROVED
            ? new Prisma.Decimal(input.approvedAmount!)
            : input.status === InsurancePreAuthorizationStatus.SUBMITTED
              ? null
              : preAuthorization.approvedAmount,
        conditions: input.conditions ?? preAuthorization.conditions,
        expiresAt: input.expiresAt ?? preAuthorization.expiresAt,
        rejectionReason:
          input.status === InsurancePreAuthorizationStatus.REJECTED
            ? input.rejectionReason
            : input.status === InsurancePreAuthorizationStatus.SUBMITTED
              ? null
              : preAuthorization.rejectionReason,
      },
    });
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      preAuthorizationId,
      type: InsuranceActivityType.PREAUTH_STATUS_CHANGED,
      summary: `Pre-authorization status changed: ${preAuthorization.status} → ${input.status}`,
      details: {
        from: preAuthorization.status,
        to: input.status,
        approvedAmount: input.approvedAmount,
        rejectionReason: input.rejectionReason,
      },
    });
  });
}

export async function listInsurancePreAuthorizations(
  clinicId: string,
  query = "",
  patientId?: string,
) {
  return prisma.insurancePreAuthorization.findMany({
    where: {
      clinicId,
      ...(patientId ? { patientId } : {}),
      ...(query
        ? {
            OR: [
              {
                patient: { fullName: { contains: query, mode: "insensitive" } },
              },
              {
                policy: {
                  provider: { name: { contains: query, mode: "insensitive" } },
                },
              },
              { requestReference: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      patient: { select: { id: true, fullName: true } },
      policy: {
        select: {
          id: true,
          validUntil: true,
          provider: { select: { id: true, name: true } },
        },
      },
      treatmentPlan: { select: { id: true, name: true } },
    },
  });
}

export async function listInsurancePreAuthorizationsPage(
  clinicId: string,
  query: string,
  requestedPage: number,
) {
  const where: Prisma.InsurancePreAuthorizationWhereInput = {
    clinicId,
    ...(query
      ? {
          OR: [
            { patient: { fullName: { contains: query, mode: "insensitive" } } },
            {
              policy: {
                provider: { name: { contains: query, mode: "insensitive" } },
              },
            },
            { requestReference: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const totalCount = await prisma.insurancePreAuthorization.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const requests = await prisma.insurancePreAuthorization.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      patient: { select: { id: true, fullName: true } },
      policy: {
        select: {
          id: true,
          validUntil: true,
          provider: { select: { id: true, name: true } },
        },
      },
      treatmentPlan: { select: { id: true, name: true } },
    },
  });
  return {
    requests,
    pagination: {
      page,
      totalPages,
      totalCount,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

export async function getInsurancePreAuthorization(
  clinicId: string,
  preAuthorizationId: string,
) {
  return prisma.insurancePreAuthorization.findFirst({
    where: { id: preAuthorizationId, clinicId },
    include: {
      patient: { select: { id: true, fullName: true } },
      policy: {
        select: {
          id: true,
          policyNumber: true,
          validUntil: true,
          provider: { select: { id: true, name: true } },
        },
      },
      treatmentPlan: { select: { id: true, name: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { user: { select: { displayName: true } } } },
        },
      },
    },
  });
}

export async function listInsuranceClaims(
  clinicId: string,
  input: {
    query: string;
    patientId?: string;
    type?: "CASHLESS" | "REIMBURSEMENT";
    status?: (typeof InsuranceClaimStatus)[keyof typeof InsuranceClaimStatus];
    from?: string;
    to?: string;
    page: number;
  },
) {
  const where: Prisma.InsuranceClaimWhereInput = {
    clinicId,
    ...(input.patientId ? { patientId: input.patientId } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: clinicDateStart(input.from) } : {}),
            ...(input.to
              ? { lt: clinicDateStart(nextCalendarDate(input.to)) }
              : {}),
          },
        }
      : {}),
    ...(input.query
      ? {
          OR: [
            {
              patient: {
                fullName: { contains: input.query, mode: "insensitive" },
              },
            },
            { claimReference: { contains: input.query, mode: "insensitive" } },
            {
              policy: {
                provider: {
                  name: { contains: input.query, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };
  const count = await prisma.insuranceClaim.count({ where });
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.min(Math.max(1, input.page), pages);
  const claims = await prisma.insuranceClaim.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      type: true,
      status: true,
      treatmentDetails: true,
      treatmentDate: true,
      amountClaimed: true,
      amountApproved: true,
      claimReference: true,
      followUpAt: true,
      createdAt: true,
      patient: { select: { id: true, fullName: true } },
      policy: {
        select: {
          id: true,
          validUntil: true,
          provider: { select: { name: true } },
        },
      },
    },
  });
  return {
    claims,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      totalCount: count,
      totalPages: pages,
    },
  };
}

export async function getInsuranceClaim(clinicId: string, claimId: string) {
  return prisma.insuranceClaim.findFirst({
    where: { id: claimId, clinicId },
    include: {
      patient: { select: { id: true, fullName: true, phoneNumber: true } },
      policy: {
        select: {
          id: true,
          policyNumber: true,
          validFrom: true,
          validUntil: true,
          coverageLimit: true,
          deductible: true,
          coPaymentPercent: true,
          exclusions: true,
          coverageNotes: true,
          provider: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              claimInstructions: true,
            },
          },
        },
      },
      treatmentPlan: { select: { id: true, name: true } },
      preAuthorization: {
        select: {
          id: true,
          status: true,
          approvedAmount: true,
          expiresAt: true,
        },
      },
      payments: { orderBy: { paidAt: "desc" } },
      documents: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
      activities: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { user: { select: { displayName: true } } } },
        },
      },
    },
  });
}

export async function createInsuranceDocumentRequirement(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  input: {
    type:
      | "POLICY_COPY"
      | "TREATMENT_ESTIMATE"
      | "TREATMENT_PLAN"
      | "CLAIM_FORM"
      | "INVOICE"
      | "PRESCRIPTION"
      | "DIAGNOSTIC_REPORT"
      | "DISCHARGE_SUMMARY"
      | "OTHER";
    name: string;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const claim = await transaction.insuranceClaim.findFirst({
      where: { id: claimId, clinicId },
      select: { id: true },
    });
    if (!claim) throw new InsuranceRecordNotFoundError();
    const document = await transaction.insuranceDocument.create({
      data: { clinicId, claimId, ...input },
      select: { id: true },
    });
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.DOCUMENT_REQUIRED,
      summary: `Required document added: ${input.name}`,
    });
    return document;
  });
}

export async function registerInsuranceDocumentUpload(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  documentId: string,
  storagePath: string,
) {
  const expectedPrefix = `${clinicId}/${claimId}/${documentId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new InsuranceRecordNotFoundError();
  }
  return prisma.$transaction(async (transaction) => {
    const result = await transaction.insuranceDocument.updateMany({
      where: {
        id: documentId,
        claimId,
        clinicId,
        status: {
          in: [
            InsuranceDocumentStatus.REQUIRED,
            InsuranceDocumentStatus.REJECTED,
          ],
        },
      },
      data: {
        storagePath,
        status: InsuranceDocumentStatus.RECEIVED,
        receivedAt: new Date(),
        verifiedAt: null,
        rejectionReason: null,
        extractionStatus: InsuranceDocumentExtractionStatus.NOT_STARTED,
        extractionData: Prisma.DbNull,
        extractionIssues: Prisma.DbNull,
        extractionCompletedAt: null,
        extractionModel: null,
      },
    });
    if (!result.count) throw new InsuranceRecordNotFoundError();
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.DOCUMENT_RECEIVED,
      summary: "A required document was received",
      details: { documentId },
    });
  });
}

export async function resetUnverifiedInsuranceDocumentUpload(
  clinicId: string,
  claimId: string,
  documentId: string,
  storagePath: string,
) {
  const result = await prisma.insuranceDocument.updateMany({
    where: {
      id: documentId,
      claimId,
      clinicId,
      storagePath,
      status: InsuranceDocumentStatus.RECEIVED,
    },
    data: {
      storagePath: null,
      status: InsuranceDocumentStatus.REQUIRED,
      receivedAt: null,
      verifiedAt: null,
      rejectionReason: null,
      extractionStatus: InsuranceDocumentExtractionStatus.NOT_STARTED,
      extractionData: Prisma.DbNull,
      extractionIssues: Prisma.DbNull,
      extractionCompletedAt: null,
      extractionModel: null,
    },
  });
  return result.count > 0;
}

export async function getInsuranceDocumentForProcessing(
  clinicId: string,
  claimId: string,
  documentId: string,
) {
  return prisma.insuranceDocument.findFirst({
    where: {
      id: documentId,
      clinicId,
      claimId,
      storagePath: { not: null },
    },
    include: {
      claim: {
        include: {
          patient: { select: { fullName: true } },
          policy: {
            include: {
              provider: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

export async function startInsuranceDocumentExtraction(
  clinicId: string,
  claimId: string,
  documentId: string,
) {
  return prisma.$transaction(async (transaction) => {
    await lockDocument(transaction, clinicId, claimId, documentId);
    const document = await transaction.insuranceDocument.findFirst({
      where: {
        id: documentId,
        clinicId,
        claimId,
        storagePath: { not: null },
        status: {
          in: [
            InsuranceDocumentStatus.RECEIVED,
            InsuranceDocumentStatus.VERIFIED,
          ],
        },
      },
      select: { id: true, extractionStatus: true },
    });
    if (!document) throw new InsuranceRecordNotFoundError();
    if (
      document.extractionStatus === InsuranceDocumentExtractionStatus.PROCESSING
    ) {
      throw new InsuranceValidationError(
        "This document is already being processed.",
      );
    }
    await transaction.insuranceDocument.updateMany({
      where: { id: documentId, clinicId, claimId },
      data: {
        extractionStatus: InsuranceDocumentExtractionStatus.PROCESSING,
        extractionData: Prisma.DbNull,
        extractionIssues: Prisma.DbNull,
        extractionCompletedAt: null,
        extractionModel: null,
      },
    });
  });
}

export async function saveInsuranceDocumentExtraction(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  documentId: string,
  input: {
    extractionData: Prisma.InputJsonValue;
    extractionIssues: Prisma.InputJsonValue;
    model: string;
  },
) {
  return prisma.$transaction(async (transaction) => {
    await lockDocument(transaction, clinicId, claimId, documentId);
    const updated = await transaction.insuranceDocument.updateMany({
      where: {
        id: documentId,
        clinicId,
        claimId,
        extractionStatus: InsuranceDocumentExtractionStatus.PROCESSING,
      },
      data: {
        extractionStatus: InsuranceDocumentExtractionStatus.NEEDS_REVIEW,
        extractionData: input.extractionData,
        extractionIssues: input.extractionIssues,
        extractionCompletedAt: new Date(),
        extractionModel: input.model,
      },
    });
    if (!updated.count) throw new InsuranceRecordNotFoundError();
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.DOCUMENT_EXTRACTION_COMPLETED,
      summary: "Document extraction completed and is awaiting staff review",
      details: { documentId },
    });
  });
}

export async function failInsuranceDocumentExtraction(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  documentId: string,
  issueCode: string,
) {
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.insuranceDocument.updateMany({
      where: {
        id: documentId,
        clinicId,
        claimId,
        extractionStatus: InsuranceDocumentExtractionStatus.PROCESSING,
      },
      data: {
        extractionStatus: InsuranceDocumentExtractionStatus.FAILED,
        extractionData: Prisma.DbNull,
        extractionIssues: { issues: [issueCode] },
        extractionCompletedAt: new Date(),
        extractionModel: null,
      },
    });
    if (!updated.count) return;
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type: InsuranceActivityType.DOCUMENT_EXTRACTION_FAILED,
      summary: "Document extraction failed and can be retried",
      details: { documentId, issueCode },
    });
  });
}

export async function updateInsuranceDocumentStatus(
  clinicId: string,
  actorUserId: string,
  claimId: string,
  documentId: string,
  input: { status: "VERIFIED" | "REJECTED"; rejectionReason: string | null },
) {
  return prisma.$transaction(async (transaction) => {
    await lockDocument(transaction, clinicId, claimId, documentId);
    const document = await transaction.insuranceDocument.findFirst({
      where: {
        id: documentId,
        claimId,
        clinicId,
        status: InsuranceDocumentStatus.RECEIVED,
        storagePath: { not: null },
      },
      select: { id: true },
    });
    if (!document) throw new InsuranceRecordNotFoundError();
    if (input.status === "REJECTED" && !input.rejectionReason?.trim()) {
      throw new InsuranceValidationError(
        "Enter a reason when rejecting a document.",
      );
    }
    await transaction.insuranceDocument.updateMany({
      where: { id: document.id, claimId, clinicId },
      data: {
        status: input.status,
        verifiedAt:
          input.status === InsuranceDocumentStatus.VERIFIED ? new Date() : null,
        rejectionReason:
          input.status === InsuranceDocumentStatus.REJECTED
            ? input.rejectionReason
            : null,
      },
    });
    await addActivity(transaction, {
      clinicId,
      actorUserId,
      claimId,
      type:
        input.status === InsuranceDocumentStatus.VERIFIED
          ? InsuranceActivityType.DOCUMENT_VERIFIED
          : InsuranceActivityType.DOCUMENT_REJECTED,
      summary:
        input.status === InsuranceDocumentStatus.VERIFIED
          ? "A document was verified"
          : "A document was rejected",
      details: {
        documentId,
        rejectionReason: input.rejectionReason,
      },
    });
  });
}

export async function getInsuranceDocumentStoragePath(
  clinicId: string,
  claimId: string,
  documentId: string,
) {
  const document = await prisma.insuranceDocument.findFirst({
    where: { id: documentId, clinicId, claimId, storagePath: { not: null } },
    select: { storagePath: true },
  });
  return document?.storagePath ?? null;
}

export async function getInsuranceDashboard(clinicId: string) {
  const now = new Date();
  const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [
    claimsInProgress,
    pendingPreAuthorizations,
    missingDocuments,
    rejectedOrPartialClaims,
    upcomingFollowUps,
    approvedClaims,
  ] = await Promise.all([
    prisma.insuranceClaim.count({
      where: { clinicId, status: { in: [...IN_PROGRESS_CLAIM_STATUSES] } },
    }),
    prisma.insurancePreAuthorization.count({
      where: {
        clinicId,
        status: {
          in: [
            InsurancePreAuthorizationStatus.SUBMITTED,
            InsurancePreAuthorizationStatus.NEEDS_DOCUMENTS,
          ],
        },
      },
    }),
    prisma.insuranceDocument.count({
      where: {
        clinicId,
        status: {
          in: [
            InsuranceDocumentStatus.REQUIRED,
            InsuranceDocumentStatus.REJECTED,
          ],
        },
      },
    }),
    prisma.insuranceClaim.count({
      where: {
        clinicId,
        status: {
          in: [
            InsuranceClaimStatus.REJECTED,
            InsuranceClaimStatus.PARTIALLY_APPROVED,
          ],
        },
      },
    }),
    prisma.insuranceClaim.count({
      where: {
        clinicId,
        followUpAt: { gte: now, lte: inThirtyDays },
        status: {
          notIn: [InsuranceClaimStatus.CLOSED, InsuranceClaimStatus.PAID],
        },
      },
    }),
    prisma.insuranceClaim.findMany({
      where: {
        clinicId,
        amountApproved: { not: null },
      },
      select: {
        id: true,
        amountApproved: true,
        payments: {
          where: { kind: InsurancePaymentKind.INSURER_PAYMENT },
          select: { amount: true },
        },
      },
    }),
  ]);
  const outstandingPaise = approvedClaims.reduce(
    (sum, claim) =>
      sum +
      calculateOutstandingPaise(
        claim.amountApproved?.toString() ?? null,
        claim.payments.map((payment) => payment.amount.toString()),
      ),
    BigInt(0),
  );
  const recentClaims = await prisma.insuranceClaim.findMany({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      type: true,
      status: true,
      amountClaimed: true,
      createdAt: true,
      patient: { select: { id: true, fullName: true } },
      policy: { select: { provider: { select: { name: true } } } },
    },
  });
  return {
    claimsInProgress,
    pendingPreAuthorizations,
    missingDocuments,
    rejectedOrPartialClaims,
    outstandingInsurerPayments: formatPaise(outstandingPaise),
    upcomingFollowUps,
    recentClaims,
  };
}

export function isInsuranceUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

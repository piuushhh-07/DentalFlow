import type { BillingEntitlements } from "@/features/billing/lib/billing-validation";

const starterFeatures = {
  fullInsuranceClaims: false,
  inventoryManagement: false,
  dentalLabManagement: false,
  expenseManagement: false,
  advancedPermissions: false,
  publicBooking: false,
  advancedReports: false,
  sterilisationTracking: false,
  equipmentManagement: false,
  multiBranchManagement: false,
  consolidatedFinance: false,
  interBranchTransfers: false,
};

const professionalFeatures = {
  ...starterFeatures,
  fullInsuranceClaims: true,
  inventoryManagement: true,
  dentalLabManagement: true,
  expenseManagement: true,
  advancedPermissions: true,
  publicBooking: true,
  advancedReports: true,
  sterilisationTracking: true,
  equipmentManagement: true,
};

const starterEntitlements = {
  maxPatients: 300,
  maxDentists: 1,
  maxStaff: 2,
  maxBranches: 1,
  features: starterFeatures,
} satisfies BillingEntitlements;

const professionalEntitlements = {
  maxPatients: 1500,
  maxDentists: 3,
  maxStaff: 5,
  maxBranches: 1,
  features: professionalFeatures,
} satisfies BillingEntitlements;

const clinicPlusEntitlements = {
  maxPatients: 5000,
  maxDentists: 10,
  maxStaff: 15,
  maxBranches: 1,
  features: professionalFeatures,
} satisfies BillingEntitlements;

export const DENTALFLOW_COMMERCIAL_PLANS = [
  {
    code: "STARTER_MONTHLY",
    displayName: "Starter",
    description: "For a solo dentist or a small dental clinic.",
    amountMinor: 49900,
    interval: "MONTH",
    intervalCount: 1,
    totalBillingCycles: 1200,
    entitlements: starterEntitlements,
    providerPlanEnv: "RAZORPAY_PLAN_STARTER_MONTHLY_ID",
  },
  {
    code: "STARTER_ANNUAL",
    displayName: "Starter",
    description: "Annual Starter subscription.",
    amountMinor: 499900,
    interval: "YEAR",
    intervalCount: 1,
    totalBillingCycles: 100,
    entitlements: starterEntitlements,
    providerPlanEnv: "RAZORPAY_PLAN_STARTER_ANNUAL_ID",
  },
  {
    code: "PROFESSIONAL_MONTHLY",
    displayName: "Professional",
    description: "For growing clinics managing multiple dentists and staff.",
    amountMinor: 99900,
    interval: "MONTH",
    intervalCount: 1,
    totalBillingCycles: 1200,
    entitlements: professionalEntitlements,
    providerPlanEnv: "RAZORPAY_PLAN_PROFESSIONAL_MONTHLY_ID",
  },
  {
    code: "PROFESSIONAL_ANNUAL",
    displayName: "Professional",
    description: "Annual Professional subscription.",
    amountMinor: 999900,
    interval: "YEAR",
    intervalCount: 1,
    totalBillingCycles: 100,
    entitlements: professionalEntitlements,
    providerPlanEnv: "RAZORPAY_PLAN_PROFESSIONAL_ANNUAL_ID",
  },
  {
    code: "CLINIC_PLUS_MONTHLY",
    displayName: "Clinic Plus",
    description: "For larger clinics with higher team and patient limits.",
    amountMinor: 149900,
    interval: "MONTH",
    intervalCount: 1,
    totalBillingCycles: 1200,
    entitlements: clinicPlusEntitlements,
    providerPlanEnv: "RAZORPAY_PLAN_CLINIC_PLUS_MONTHLY_ID",
  },
  {
    code: "CLINIC_PLUS_ANNUAL",
    displayName: "Clinic Plus",
    description: "Annual Clinic Plus subscription.",
    amountMinor: 1499900,
    interval: "YEAR",
    intervalCount: 1,
    totalBillingCycles: 100,
    entitlements: clinicPlusEntitlements,
    providerPlanEnv: "RAZORPAY_PLAN_CLINIC_PLUS_ANNUAL_ID",
  },
] as const;

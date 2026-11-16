import type { BillingEntitlements } from "@/features/billing/lib/billing-validation";

/**
 * Draft entitlement matrix for the three DentalFlow tiers.
 *
 * This is intentionally not a billing seed: prices, Razorpay plan IDs,
 * patient/appointment quotas, trial terms, and commercial terms still need
 * approval before any plan version is made available for checkout.
 */
export const DENTALFLOW_PLAN_ENTITLEMENTS = {
  solo: {
    maxDentists: 1,
    maxStaff: 2,
    maxBranches: 1,
    features: {
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
    },
  },
  professional: {
    maxDentists: 5,
    maxStaff: 10,
    maxBranches: 1,
    features: {
      fullInsuranceClaims: true,
      inventoryManagement: true,
      dentalLabManagement: true,
      expenseManagement: true,
      advancedPermissions: true,
      publicBooking: true,
      advancedReports: true,
      sterilisationTracking: true,
      equipmentManagement: true,
      multiBranchManagement: false,
      consolidatedFinance: false,
      interBranchTransfers: false,
    },
  },
  enterprise: {
    maxDentists: 15,
    maxStaff: 30,
    maxBranches: 3,
    features: {
      fullInsuranceClaims: true,
      inventoryManagement: true,
      dentalLabManagement: true,
      expenseManagement: true,
      advancedPermissions: true,
      publicBooking: true,
      advancedReports: true,
      sterilisationTracking: true,
      equipmentManagement: true,
      multiBranchManagement: true,
      consolidatedFinance: true,
      interBranchTransfers: true,
    },
  },
} satisfies Record<"solo" | "professional" | "enterprise", BillingEntitlements>;

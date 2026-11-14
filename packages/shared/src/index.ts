/**
 * Domain constants shared by apps/api (NestJS) and apps/web (React).
 * Source of truth: FoodCycle-Technical-Plan-v2.md
 */

export const ROLES = ["DONOR", "CHARITY", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ORG_STATUSES = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const CLAIM_APPROVAL_MODES = ["AUTO", "MANUAL"] as const;
export type ClaimApprovalMode = (typeof CLAIM_APPROVAL_MODES)[number];

export const OFFER_STATUSES = ["PUBLISHED", "RESERVED", "COMPLETED", "EXPIRED", "CANCELLED"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const CLAIM_STATUSES = [
  "PENDING_APPROVAL",
  "RESERVED",
  "PICKED_UP",
  "REJECTED",
  "APPROVAL_TIMEOUT",
  "EXPIRED",
  "CANCELLED_BY_CHARITY",
  "CANCELLED_BY_DONOR",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const URGENCY_LEVELS = ["CRITICAL", "SOON", "NORMAL"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const ALLERGENS = [
  "gluten",
  "dairy",
  "eggs",
  "nuts",
  "peanuts",
  "soy",
  "fish",
  "shellfish",
  "sesame",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const STORAGE_CONDITIONS = ["ROOM_TEMP", "HOT", "REFRIGERATED", "FROZEN"] as const;
export type StorageCondition = (typeof STORAGE_CONDITIONS)[number];

/** Default thresholds (overridable from app_settings on the server) */
export const DEFAULT_URGENCY_THRESHOLDS = { criticalMinutes: 60, soonMinutes: 180 } as const;

export function urgencyFor(
  remainingMinutes: number,
  t: { criticalMinutes: number; soonMinutes: number } = DEFAULT_URGENCY_THRESHOLDS,
): Urgency {
  if (remainingMinutes <= t.criticalMinutes) return "CRITICAL";
  if (remainingMinutes <= t.soonMinutes) return "SOON";
  return "NORMAL";
}

export const DONOR_ORG_TYPES = ["RESTAURANT", "HOTEL", "BAKERY", "GROCERY"] as const;
export const CHARITY_ORG_TYPES = ["CHARITY", "HUMANITARIAN"] as const;
export const ORG_TYPES = [...DONOR_ORG_TYPES, ...CHARITY_ORG_TYPES] as const;
export type OrgType = (typeof ORG_TYPES)[number];

/** Which organization types each self-registering role may choose */
export const ORG_TYPES_BY_ROLE = {
  DONOR: DONOR_ORG_TYPES,
  CHARITY: CHARITY_ORG_TYPES,
} as const;

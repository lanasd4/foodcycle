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

// ------------------------------------------------------------------ cities

export const CITIES = ["DAMASCUS", "ALEPPO"] as const;
export type City = (typeof CITIES)[number];

export type GeoPoint = { lat: number; lng: number };

export interface CityInfo {
  label: string;
  /** Map view when nothing is selected yet */
  center: GeoPoint;
  zoom: number;
  /** The city and its immediate suburbs; locations outside are refused */
  bounds: { south: number; west: number; north: number; east: number };
  /** Neighbourhoods offered as suggestions; points checked against OpenStreetMap (Nominatim) */
  areas: readonly { name: string; location: GeoPoint }[];
}

export const CITY_INFO: Record<City, CityInfo> = {
  DAMASCUS: {
    label: "دمشق",
    center: { lat: 33.5138, lng: 36.2765 },
    zoom: 13,
    bounds: { south: 33.38, west: 36.12, north: 33.68, east: 36.48 },
    areas: [
      { name: "المزة", location: { lat: 33.5032, lng: 36.2496 } },
      { name: "كفرسوسة", location: { lat: 33.5009, lng: 36.2835 } },
      { name: "المالكي", location: { lat: 33.5183, lng: 36.2712 } },
      { name: "أبو رمانة", location: { lat: 33.5186, lng: 36.2815 } },
      { name: "الشعلان", location: { lat: 33.5182, lng: 36.2904 } },
      { name: "المهاجرين", location: { lat: 33.5221, lng: 36.2781 } },
      { name: "المزرعة", location: { lat: 33.5241, lng: 36.2972 } },
      { name: "القصاع", location: { lat: 33.5187, lng: 36.3161 } },
      { name: "باب توما", location: { lat: 33.5111, lng: 36.3167 } },
      { name: "الميدان", location: { lat: 33.4933, lng: 36.2969 } },
      { name: "ركن الدين", location: { lat: 33.54, lng: 36.2988 } },
      { name: "برزة", location: { lat: 33.5571, lng: 36.3227 } },
      { name: "دمر", location: { lat: 33.5388, lng: 36.2371 } },
    ],
  },
  ALEPPO: {
    label: "حلب",
    center: { lat: 36.205, lng: 37.14 },
    zoom: 13,
    bounds: { south: 36.1, west: 37.02, north: 36.32, east: 37.3 },
    areas: [
      { name: "العزيزية", location: { lat: 36.2104, lng: 37.1544 } },
      { name: "السليمانية", location: { lat: 36.2163, lng: 37.1593 } },
      { name: "الجميلية", location: { lat: 36.2095, lng: 37.1417 } },
      { name: "باب الفرج", location: { lat: 36.2041, lng: 37.1528 } },
      { name: "السريان", location: { lat: 36.2168, lng: 37.1444 } },
      { name: "الأشرفية", location: { lat: 36.23, lng: 37.1442 } },
      { name: "المحافظة", location: { lat: 36.2113, lng: 37.1344 } },
      { name: "السبيل", location: { lat: 36.2194, lng: 37.1336 } },
      { name: "الموكامبو", location: { lat: 36.2195, lng: 37.1254 } },
      { name: "الفرقان", location: { lat: 36.2034, lng: 37.1137 } },
      { name: "حلب الجديدة", location: { lat: 36.1999, lng: 37.0981 } },
      { name: "سيف الدولة", location: { lat: 36.1914, lng: 37.1256 } },
      { name: "الكلاسة", location: { lat: 36.1923, lng: 37.1475 } },
      { name: "الحمدانية", location: { lat: 36.1788, lng: 37.0997 } },
    ],
  },
};

export function isInCity(city: City, p: GeoPoint): boolean {
  const b = CITY_INFO[city].bounds;
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}

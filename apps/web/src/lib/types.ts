/** Shapes returned by the API (mirror of the server presenters). */
import type {
  Allergen,
  ClaimApprovalMode,
  ClaimStatus,
  OfferStatus,
  OrgStatus,
  OrgType,
  Role,
  StorageCondition,
  Urgency,
} from '@foodcycle/shared';

export type LatLng = { lat: number; lng: number };

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  phone: string;
  address: string;
  area: string;
  location: LatLng;
  registrationNumber: string | null;
  status: OrgStatus;
  statusReason: string | null;
  trustScore: number;
  claimApprovalMode: ClaimApprovalMode;
  verifiedAt: string | null;
  createdAt: string;
}

export interface Session {
  accessToken: string;
  user: User;
  organization: Organization | null;
}

export interface Category {
  code: string;
  name: string;
  safeHours: number;
  portionKg: number;
  needsColdChain: boolean;
}

export interface Offer {
  id: string;
  donorId: string;
  donorName?: string;
  category?: Category;
  title: string;
  description: string | null;
  ingredients: string | null;
  allergens: Allergen[];
  allergensDeclared: boolean;
  storageCondition: StorageCondition;
  storageInstructions: string | null;
  photoUrl: string | null;
  quantityKg: number;
  remainingKg: number;
  portions: number | null;
  preparedAt: string;
  readyAt: string;
  pickupBy: string;
  effectiveDeadline: string;
  remainingMinutes: number;
  urgency: Urgency;
  claimApprovalMode: ClaimApprovalMode | null;
  effectiveApprovalMode: ClaimApprovalMode | null;
  location: LatLng;
  pickupAddress: string;
  area: string;
  distanceKm?: number;
  status: OfferStatus;
  cancelReason: string | null;
  createdAt: string;
}

export interface Claim {
  id: string;
  offerId: string;
  offer?: {
    title: string;
    donorName?: string;
    pickupAddress: string;
    area: string;
    location: LatLng;
    effectiveDeadline: string;
    storageCondition: StorageCondition;
    allergens: Allergen[];
  };
  charity?: { id: string; name: string; trustScore: number };
  quantityKg: number;
  status: ClaimStatus;
  approvalMode: ClaimApprovalMode;
  approvalDeadline: string | null;
  approvalSecondsLeft: number | null;
  reservedUntil: string | null;
  reservationSecondsLeft: number | null;
  decidedAt: string | null;
  rejectReason: string | null;
  pickedUpAt: string | null;
  createdAt: string;
  qrPayload?: string | null;
  pickupCode?: string | null;
  ratedByMe?: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface MatchComponents {
  dist: number;
  type: number;
  qty: number;
  time: number;
  trust: number;
}

export interface Recommendation {
  offer: Offer;
  match: { score: number; components: MatchComponents; travelMinutes: number; reasons: string[] };
}

export interface CharityMatch {
  charityId: string;
  name: string;
  area: string;
  trustScore: number;
  distanceKm: number;
  travelMinutes: number;
  score: number;
  components: MatchComponents;
  reasons: string[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface CharityNeeds {
  acceptedCategories: string[];
  preferredCategories: string[];
  dailyCapacityKg: number | null;
  pickupHours: { start: string; end: string } | null;
}

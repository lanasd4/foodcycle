import type { FoodCategory, Offer } from './offer.entities.js';
import { remainingMinutes, urgencyOf } from './offer.rules.js';

export interface PresentContext {
  now: Date;
  thresholds: { criticalMinutes: number; soonMinutes: number };
}

export function presentCategory(c: FoodCategory) {
  return {
    code: c.code,
    name: c.name,
    safeHours: c.safeHours,
    portionKg: c.portionKg,
    needsColdChain: c.needsColdChain,
  };
}

/** Public JSON shape of an offer, with computed time-left and urgency. */
export function presentOffer(o: Offer, ctx: PresentContext, extra: { distanceKm?: number | null } = {}) {
  const [lng, lat] = o.location.coordinates;
  return {
    id: o.id,
    donorId: o.donorId,
    donorName: o.donor?.name,
    category: o.category ? presentCategory(o.category) : undefined,
    title: o.title,
    description: o.description,
    ingredients: o.ingredients,
    allergens: o.allergens,
    allergensDeclared: o.allergensDeclared,
    storageCondition: o.storageCondition,
    storageInstructions: o.storageInstructions,
    photoUrl: o.photoUrl,
    quantityKg: o.quantityKg,
    remainingKg: o.remainingKg,
    portions: o.portions,
    preparedAt: o.preparedAt,
    readyAt: o.readyAt,
    pickupBy: o.pickupBy,
    effectiveDeadline: o.effectiveDeadline,
    remainingMinutes: remainingMinutes(o.effectiveDeadline, ctx.now),
    urgency: urgencyOf(o.effectiveDeadline, ctx.now, ctx.thresholds),
    claimApprovalMode: o.claimApprovalMode,
    /** What a new claim will get: the offer override, else the restaurant setting */
    effectiveApprovalMode: o.claimApprovalMode ?? o.donor?.claimApprovalMode ?? null,
    location: { lat, lng },
    pickupAddress: o.pickupAddress,
    area: o.area,
    distanceKm: extra.distanceKm == null ? undefined : Math.round(extra.distanceKm * 10) / 10,
    status: o.status,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt,
  };
}
export type OfferDto = ReturnType<typeof presentOffer>;

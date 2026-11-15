import type { Claim } from './claim.entity.js';

/**
 * Claim JSON. The QR token and pickup code are secrets of the charity:
 * pass `withSecrets` only when the caller is that charity and the claim is RESERVED.
 */
export function presentClaim(
  c: Claim,
  opts: { now: Date; withSecrets?: { qrToken: string | null; pickupCode: string | null } },
) {
  const secondsLeft = (d: Date | null) =>
    d ? Math.max(0, Math.floor((d.getTime() - opts.now.getTime()) / 1000)) : null;
  return {
    id: c.id,
    offerId: c.offerId,
    offer: c.offer
      ? {
          title: c.offer.title,
          donorName: c.offer.donor?.name,
          pickupAddress: c.offer.pickupAddress,
          area: c.offer.area,
          location: { lat: c.offer.location.coordinates[1], lng: c.offer.location.coordinates[0] },
          effectiveDeadline: c.offer.effectiveDeadline,
          storageCondition: c.offer.storageCondition,
          allergens: c.offer.allergens,
        }
      : undefined,
    charity: c.charity ? { id: c.charity.id, name: c.charity.name, trustScore: c.charity.trustScore } : undefined,
    quantityKg: c.quantityKg,
    status: c.status,
    approvalMode: c.approvalModeApplied,
    approvalDeadline: c.approvalDeadline,
    approvalSecondsLeft: c.status === 'PENDING_APPROVAL' ? secondsLeft(c.approvalDeadline) : null,
    reservedUntil: c.reservedUntil,
    reservationSecondsLeft: c.status === 'RESERVED' ? secondsLeft(c.reservedUntil) : null,
    decidedAt: c.decidedAt,
    rejectReason: c.rejectReason,
    pickedUpAt: c.pickedUpAt,
    createdAt: c.createdAt,
    ...(opts.withSecrets && c.status === 'RESERVED'
      ? {
          // what the charity's QR code encodes
          qrPayload: opts.withSecrets.qrToken ? `FC1:${opts.withSecrets.qrToken}` : null,
          pickupCode: opts.withSecrets.pickupCode,
        }
      : {}),
  };
}
export type ClaimDto = ReturnType<typeof presentClaim>;

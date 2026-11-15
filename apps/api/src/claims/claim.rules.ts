/**
 * Pure timing rules for claims (technical plan, section 6.2).
 */
const MINUTE = 60_000;

/** AUTO, or after approval: hold the food for reservation_minutes, never past the offer's deadline. */
export function reservationDeadline(now: Date, reservationMinutes: number, offerDeadline: Date): Date {
  return new Date(Math.min(now.getTime() + reservationMinutes * MINUTE, offerDeadline.getTime()));
}

/**
 * MANUAL: the donor has approval_timeout_minutes to answer, but never so late that
 * the charity would no longer have time to transport the food.
 */
export function approvalDeadline(
  now: Date,
  approvalTimeoutMinutes: number,
  offerDeadline: Date,
  minTransportMinutes: number,
): Date {
  return new Date(
    Math.min(now.getTime() + approvalTimeoutMinutes * MINUTE, offerDeadline.getTime() - minTransportMinutes * MINUTE),
  );
}

/** The mode used for a new claim: the offer's override, else the restaurant's setting. */
export function effectiveApprovalMode<M extends string>(offerMode: M | null, orgMode: M): M {
  return offerMode ?? orgMode;
}

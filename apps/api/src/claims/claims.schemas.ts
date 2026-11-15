import { z } from 'zod';

export const createClaimSchema = z.object({ quantityKg: z.number().positive().max(5000) }).strict();
export type CreateClaimInput = z.infer<typeof createClaimSchema>;

export const rejectClaimSchema = z.object({ reason: z.string().trim().min(3).max(500).optional() }).strict();
export type RejectClaimInput = z.infer<typeof rejectClaimSchema>;

/**
 * The donor confirms a pickup either by scanning the charity's QR code,
 * or (camera not working) by typing the 6-digit pickup code for that offer.
 */
export const confirmPickupSchema = z.union([
  z.object({ qrToken: z.string().trim().min(10).max(80) }).strict(),
  z.object({ offerId: z.string().uuid(), pickupCode: z.string().regex(/^\d{6}$/) }).strict(),
]);
export type ConfirmPickupInput = z.infer<typeof confirmPickupSchema>;

export const listClaimsQuery = z.object({
  status: z
    .enum([
      'PENDING_APPROVAL',
      'RESERVED',
      'PICKED_UP',
      'REJECTED',
      'APPROVAL_TIMEOUT',
      'EXPIRED',
      'CANCELLED_BY_CHARITY',
      'CANCELLED_BY_DONOR',
    ])
    .optional(),
  /** Only the claims of this offer */
  offerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListClaimsQuery = z.infer<typeof listClaimsQuery>;

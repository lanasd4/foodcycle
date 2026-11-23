import { CITIES } from '@foodcycle/shared';
import { z } from 'zod';

export const updateSettingsSchema = z
  .object({ claimApprovalMode: z.enum(['AUTO', 'MANUAL']) })
  .strict();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const verifySchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export type VerifyInput = z.infer<typeof verifySchema>;

export const listOrgsQuery = z.object({
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED']).optional(),
  city: z.enum(CITIES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListOrgsQuery = z.infer<typeof listOrgsQuery>;

import { ALLERGENS, STORAGE_CONDITIONS } from '@foodcycle/shared';
import { z } from 'zod';
import { locationSchema } from '../auth/auth.schemas.js';

const isoDate = z.string().datetime({ offset: true });
const allergens = z
  .array(z.enum(ALLERGENS))
  .max(ALLERGENS.length)
  .refine((a) => new Set(a).size === a.length, 'Duplicate allergens');
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createOfferSchema = z
  .object({
    categoryCode: z.string().trim().min(1).max(32),
    title: z.string().trim().min(2).max(120),
    description: optionalText(1000),
    ingredients: optionalText(1000),
    allergens: allergens.default([]),
    /** The donor must confirm the allergen list explicitly, even when it is empty */
    allergensDeclared: z.boolean(),
    storageCondition: z.enum(STORAGE_CONDITIONS),
    storageInstructions: optionalText(500),
    photoUrl: z.string().url().max(500).optional(),
    quantityKg: z.number().positive().max(5000).optional(),
    portions: z.number().int().positive().max(100_000).optional(),
    preparedAt: isoDate,
    /** Defaults to now */
    readyAt: isoDate.optional(),
    pickupBy: isoDate,
    /** Overrides the restaurant's setting for this offer only */
    claimApprovalMode: z.enum(['AUTO', 'MANUAL']).optional(),
    /** Defaults to the organization's location and address */
    location: locationSchema.optional(),
    pickupAddress: optionalText(300),
    area: optionalText(120),
  })
  .strict()
  .refine((v) => v.quantityKg != null || v.portions != null, {
    path: ['quantityKg'],
    message: 'quantityKg or portions is required',
  });
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

/** Editable only while nobody has claimed anything from the offer. */
export const updateOfferSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable(),
    ingredients: z.string().trim().max(1000).nullable(),
    allergens,
    allergensDeclared: z.boolean(),
    storageCondition: z.enum(STORAGE_CONDITIONS),
    storageInstructions: z.string().trim().max(500).nullable(),
    photoUrl: z.string().url().max(500).nullable(),
    quantityKg: z.number().positive().max(5000),
    readyAt: isoDate,
    pickupBy: isoDate,
    claimApprovalMode: z.enum(['AUTO', 'MANUAL']).nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const cancelOfferSchema = z.object({ reason: z.string().trim().min(3).max(500).optional() }).strict();
export type CancelOfferInput = z.infer<typeof cancelOfferSchema>;

const csvAllergens = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.enum(ALLERGENS)));

export const browseOffersQuery = z.object({
  category: z.string().max(32).optional(),
  maxKm: z.coerce.number().positive().max(100).optional(),
  /** Comma-separated: hide offers containing any of these allergens */
  excludeAllergens: csvAllergens.optional(),
  minKg: z.coerce.number().positive().optional(),
  area: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type BrowseOffersQuery = z.infer<typeof browseOffersQuery>;

export const myOffersQuery = z.object({
  status: z.enum(['PUBLISHED', 'RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type MyOffersQuery = z.infer<typeof myOffersQuery>;

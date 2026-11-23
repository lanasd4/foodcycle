import { CHARITY_ORG_TYPES, CITIES, DONOR_ORG_TYPES, isInCity, ORG_TYPES } from '@foodcycle/shared';
import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
// bcrypt only uses the first 72 bytes; refuse longer input instead of truncating silently
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password is too long');

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const registerSchema = z
  .object({
    email,
    password,
    role: z.enum(['DONOR', 'CHARITY']),
    organization: z.object({
      name: z.string().trim().min(2).max(160),
      type: z.enum(ORG_TYPES),
      phone: z
        .string()
        .trim()
        .regex(/^\+?[0-9 ()-]{7,20}$/, 'Invalid phone number'),
      address: z.string().trim().min(5).max(300),
      city: z.enum(CITIES).default('DAMASCUS'),
      area: z.string().trim().min(2).max(120),
      location: locationSchema,
      registrationNumber: z.string().trim().max(80).optional(),
    }),
  })
  .refine(
    (v) =>
      v.role === 'DONOR'
        ? (DONOR_ORG_TYPES as readonly string[]).includes(v.organization.type)
        : (CHARITY_ORG_TYPES as readonly string[]).includes(v.organization.type),
    { path: ['organization', 'type'], message: 'Organization type does not match the role' },
  )
  .refine((v) => isInCity(v.organization.city, v.organization.location), {
    path: ['organization', 'location'],
    message: 'Location is outside the selected city',
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
export type LoginInput = z.infer<typeof loginSchema>;

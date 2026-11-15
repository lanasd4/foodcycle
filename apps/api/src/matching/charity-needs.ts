import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { diff } from '../audit/audit.util.js';
import type { AuthUser } from '../auth/auth.types.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
const codes = z.array(z.string().max(32)).max(20);

export const charityNeedsSchema = z
  .object({
    acceptedCategories: codes.min(1),
    /** Must be a subset of acceptedCategories */
    preferredCategories: codes.default([]),
    /** null = no daily limit */
    dailyCapacityKg: z.number().positive().max(10_000).nullable(),
    /** null = any time. May cross midnight (e.g. 20:00 → 02:00) */
    pickupHours: z.object({ start: hhmm, end: hhmm }).refine((h) => h.start !== h.end, 'Empty window').nullable(),
  })
  .strict()
  .refine((v) => v.preferredCategories.every((c) => v.acceptedCategories.includes(c)), {
    path: ['preferredCategories'],
    message: 'Preferred categories must also be accepted',
  });
export type CharityNeedsInput = z.infer<typeof charityNeedsSchema>;

interface NeedsRow {
  accepted: string[];
  preferred: string[];
  cap: number | null;
  pickup_start: string | null;
  pickup_end: string | null;
}

/** What a charity accepts, how much per day, and when it can pick up. Feeds the matching. */
@Injectable()
export class CharityNeedsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthUser) {
    const [row]: NeedsRow[] = await this.db.query(
      `SELECT
         ARRAY(SELECT code FROM food_categories WHERE id = ANY(n.accepted_categories) ORDER BY sort_order) AS accepted,
         ARRAY(SELECT code FROM food_categories WHERE id = ANY(n.preferred_categories) ORDER BY sort_order) AS preferred,
         n.daily_capacity_kg::float AS cap,
         to_char(n.pickup_start, 'HH24:MI') AS pickup_start,
         to_char(n.pickup_end, 'HH24:MI') AS pickup_end
       FROM charity_needs n WHERE n.charity_id = $1`,
      [user.orgId],
    );
    return row ? present(row) : null;
  }

  async put(user: AuthUser, input: CharityNeedsInput) {
    const cats: { id: number; code: string }[] = await this.db.query(`SELECT id, code FROM food_categories`);
    const idOf = new Map(cats.map((c) => [c.code, c.id]));
    const unknown = [...input.acceptedCategories, ...input.preferredCategories].filter((c) => !idOf.has(c));
    if (unknown.length) throw new BadRequestException({ code: 'UNKNOWN_CATEGORY', categories: [...new Set(unknown)] });

    const before = await this.get(user);
    await this.db.transaction(async (m) => {
      await m.query(
        `INSERT INTO charity_needs (charity_id, accepted_categories, preferred_categories, daily_capacity_kg, pickup_start, pickup_end, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (charity_id) DO UPDATE SET
           accepted_categories = EXCLUDED.accepted_categories,
           preferred_categories = EXCLUDED.preferred_categories,
           daily_capacity_kg = EXCLUDED.daily_capacity_kg,
           pickup_start = EXCLUDED.pickup_start,
           pickup_end = EXCLUDED.pickup_end,
           updated_at = now()`,
        [
          user.orgId,
          [...new Set(input.acceptedCategories)].map((c) => idOf.get(c)),
          [...new Set(input.preferredCategories)].map((c) => idOf.get(c)),
          input.dailyCapacityKg,
          input.pickupHours?.start ?? null,
          input.pickupHours?.end ?? null,
        ],
      );
      const after = {
        acceptedCategories: input.acceptedCategories,
        preferredCategories: input.preferredCategories,
        dailyCapacityKg: input.dailyCapacityKg,
        pickupHours: input.pickupHours,
      };
      const changes = diff((before ?? {}) as Record<string, unknown>, after);
      if (changes) {
        await this.audit.record(m, { action: 'org.needs.updated', entityType: 'organization', entityId: user.orgId, ...changes });
      }
    });
    return this.get(user);
  }
}

function present(r: NeedsRow) {
  return {
    acceptedCategories: r.accepted,
    preferredCategories: r.preferred,
    dailyCapacityKg: r.cap,
    pickupHours: r.pickup_start && r.pickup_end ? { start: r.pickup_start, end: r.pickup_end } : null,
  };
}

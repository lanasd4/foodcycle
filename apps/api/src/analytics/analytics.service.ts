import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CHARITY_ORG_TYPES } from '@foodcycle/shared';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { SettingsService } from '../settings/settings.service.js';

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 366;

/**
 * Period filter shared by every analytics endpoint: [from, to).
 * Default: the last 30 days.
 */
export const periodQuery = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .transform((q) => {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY);
    return { from, to };
  })
  .refine((p) => p.from < p.to, { message: '`from` must be before `to`' })
  .refine((p) => p.to.getTime() - p.from.getTime() <= MAX_RANGE_DAYS * DAY, {
    message: `Period is limited to ${MAX_RANGE_DAYS} days`,
  });
export type Period = z.infer<typeof periodQuery>;

export const topDonorsQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(10) })
  .and(periodQuery);
export const trendQuery = z.object({ bucket: z.enum(['day', 'week', 'month']).default('day') }).and(periodQuery);

/** Percentage change, rounded to 1 decimal; null when there is nothing to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** need_index = 1 - received / requested, clamped to [0, 1]; null when no need was declared. */
export function needIndex(requestedKg: number | null, receivedKg: number): number | null {
  if (!requestedKg || requestedKg <= 0) return null;
  return Math.round(Math.min(1, Math.max(0, 1 - receivedKg / requestedKg)) * 1000) / 1000;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Impact Analytics (technical plan, section 7.3).
 * Only completed pickups (claims in PICKED_UP) count as food saved; the time
 * of a pickup is picked_up_at.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly settings: SettingsService,
  ) {}

  /** Headline numbers for the period, with the change against the previous period of the same length. */
  async summary(p: Period) {
    const length = p.to.getTime() - p.from.getTime();
    const previous = { from: new Date(p.from.getTime() - length), to: p.from };
    const [cur, prev] = await Promise.all([this.totals(p), this.totals(previous)]);
    return {
      period: { from: p.from, to: p.to },
      previousPeriod: previous,
      ...cur,
      change: {
        kgSaved: pctChange(cur.kgSaved, prev.kgSaved),
        donations: pctChange(cur.donations, prev.donations),
        activeDonors: pctChange(cur.activeDonors, prev.activeDonors),
        activeCharities: pctChange(cur.activeCharities, prev.activeCharities),
      },
      previous: prev,
    };
  }

  private async totals(p: { from: Date; to: Date }) {
    const [[saved], [offers]] = await Promise.all([
      this.db.query(
        `SELECT coalesce(sum(c.quantity_kg), 0)::float AS kg,
                count(*)::int                       AS donations,
                count(DISTINCT o.donor_id)::int     AS donors,
                count(DISTINCT c.charity_id)::int   AS charities
           FROM claims c JOIN offers o ON o.id = c.offer_id
          WHERE c.status = 'PICKED_UP' AND c.picked_up_at >= $1 AND c.picked_up_at < $2`,
        [p.from, p.to],
      ),
      this.db.query(
        `SELECT count(*)::int                                                    AS published,
                coalesce(sum(quantity_kg), 0)::float                             AS published_kg,
                count(*) FILTER (WHERE status = 'EXPIRED')::int                  AS expired,
                coalesce(sum(remaining_kg) FILTER (WHERE status = 'EXPIRED'), 0)::float AS expired_kg
           FROM offers WHERE created_at >= $1 AND created_at < $2`,
        [p.from, p.to],
      ),
    ]);
    return {
      kgSaved: r1(saved.kg),
      donations: saved.donations,
      activeDonors: saved.donors,
      activeCharities: saved.charities,
      offersPublished: offers.published,
      kgPublished: r1(offers.published_kg),
      offersExpired: offers.expired,
      /** Food published in the period that expired without being claimed */
      kgExpiredUnclaimed: r1(offers.expired_kg),
      /** Share of published food that was lost (0..1) */
      lossRate: offers.published_kg > 0 ? Math.round((offers.expired_kg / offers.published_kg) * 1000) / 1000 : null,
    };
  }

  /** Donors ranked by kg actually picked up in the period. */
  async topDonors(p: Period & { limit: number }) {
    const rows = await this.db.query(
      `SELECT d.id, d.name, d.type, d.area,
              sum(c.quantity_kg)::float         AS kg,
              count(*)::int                     AS donations,
              count(DISTINCT c.charity_id)::int AS charities
         FROM claims c
         JOIN offers o ON o.id = c.offer_id
         JOIN organizations d ON d.id = o.donor_id
        WHERE c.status = 'PICKED_UP' AND c.picked_up_at >= $1 AND c.picked_up_at < $2
        GROUP BY d.id
        ORDER BY kg DESC, donations DESC, d.name
        LIMIT $3`,
      [p.from, p.to, p.limit],
    );
    return {
      items: rows.map(
        (r: { id: string; name: string; type: string; area: string; kg: number; donations: number; charities: number }, i: number) => ({
          rank: i + 1,
          donorId: r.id,
          name: r.name,
          type: r.type,
          area: r.area,
          kgSaved: r1(r.kg),
          donations: r.donations,
          charitiesServed: r.charities,
        }),
      ),
    };
  }

  /**
   * Areas ranked by unmet need.
   *   requested = sum of the daily capacity declared by the area's charities x days in the period
   *   received  = kg those same charities actually picked up in the period
   *   need_index = 1 - received / requested   (1 = nothing received, 0 = need covered)
   * Daily capacity is the best proxy of demand we have: it is what charities say they can distribute.
   * Areas whose charities declared no capacity get need_index = null (unknown, listed last).
   * lat/lng is the centre of the area's charities, for the heat map.
   */
  async needByArea(p: Period) {
    const days = (p.to.getTime() - p.from.getTime()) / DAY;
    const rows = await this.db.query(
      `WITH ch AS (
         SELECT o.id, o.area, o.location, n.daily_capacity_kg AS cap
           FROM organizations o LEFT JOIN charity_needs n ON n.charity_id = o.id
          WHERE o.status = 'ACTIVE' AND o.type = ANY($3::org_type[])
       ),
       recv AS (
         SELECT c.charity_id, sum(c.quantity_kg) AS kg
           FROM claims c
          WHERE c.status = 'PICKED_UP' AND c.picked_up_at >= $1 AND c.picked_up_at < $2
          GROUP BY c.charity_id
       )
       SELECT ch.area,
              count(*)::int                                                   AS charities,
              sum(ch.cap)::float                                              AS daily_capacity,
              coalesce(sum(recv.kg) FILTER (WHERE ch.cap IS NOT NULL), 0)::float AS received_declared,
              coalesce(sum(recv.kg), 0)::float                                AS received_total,
              avg(ST_Y(ch.location::geometry))                                AS lat,
              avg(ST_X(ch.location::geometry))                                AS lng
         FROM ch LEFT JOIN recv ON recv.charity_id = ch.id
        GROUP BY ch.area`,
      [p.from, p.to, [...CHARITY_ORG_TYPES]],
    );
    const items = rows
      .map(
        (r: {
          area: string;
          charities: number;
          daily_capacity: number | null;
          received_declared: number;
          received_total: number;
          lat: number;
          lng: number;
        }) => {
          const requested = r.daily_capacity == null ? null : r.daily_capacity * days;
          return {
            area: r.area,
            charities: r.charities,
            requestedKg: requested == null ? null : r1(requested),
            receivedKg: r1(r.received_total),
            needIndex: needIndex(requested, r.received_declared),
            location: { lat: Number(r.lat), lng: Number(r.lng) },
          };
        },
      )
      .sort(
        (a: { needIndex: number | null; area: string }, b: { needIndex: number | null; area: string }) =>
          (b.needIndex ?? -1) - (a.needIndex ?? -1) || a.area.localeCompare(b.area, 'ar'),
      );
    return { periodDays: r1(days), items };
  }

  /** Kg saved per day / week / month (local time zone), every bucket present, for charts. */
  async trend(p: Period & { bucket: 'day' | 'week' | 'month' }) {
    const { timezone } = await this.settings.all();
    const rows = await this.db.query(
      `WITH buckets AS (
         SELECT generate_series(
                  date_trunc($3, $1::timestamptz AT TIME ZONE $4),
                  date_trunc($3, ($2::timestamptz - interval '1 microsecond') AT TIME ZONE $4),
                  ('1 ' || $3)::interval) AS b
       )
       SELECT to_char(buckets.b, 'YYYY-MM-DD')        AS start,
              coalesce(sum(c.quantity_kg), 0)::float  AS kg,
              count(c.id)::int                        AS donations
         FROM buckets
         LEFT JOIN claims c
           ON c.status = 'PICKED_UP'
          AND c.picked_up_at >= $1 AND c.picked_up_at < $2
          AND date_trunc($3, c.picked_up_at AT TIME ZONE $4) = buckets.b
        GROUP BY buckets.b
        ORDER BY buckets.b`,
      [p.from, p.to, p.bucket, timezone],
    );
    return {
      bucket: p.bucket,
      timezone,
      points: rows.map((r: { start: string; kg: number; donations: number }) => ({
        start: r.start,
        kgSaved: r1(r.kg),
        donations: r.donations,
      })),
    };
  }

  /** The caller's own impact: food given (donor) or received (charity). */
  async mine(user: AuthUser, p: Period) {
    const asDonor = user.role === 'DONOR';
    const [row] = await this.db.query(
      `SELECT coalesce(sum(c.quantity_kg), 0)::float AS kg,
              count(*)::int AS pickups,
              count(DISTINCT ${asDonor ? 'c.charity_id' : 'o.donor_id'})::int AS partners
         FROM claims c JOIN offers o ON o.id = c.offer_id
        WHERE c.status = 'PICKED_UP' AND c.picked_up_at >= $1 AND c.picked_up_at < $2
          AND ${asDonor ? 'o.donor_id' : 'c.charity_id'} = $3`,
      [p.from, p.to, user.orgId],
    );
    return {
      role: user.role,
      period: { from: p.from, to: p.to },
      kg: r1(row.kg),
      pickups: row.pickups,
      /** charities served (donor) or donors received from (charity) */
      partners: row.partners,
    };
  }
}

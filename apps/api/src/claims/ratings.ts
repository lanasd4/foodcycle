import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Organization } from '../organizations/organization.entity.js';
import { TrustService } from '../organizations/trust.js';
import { SettingsService } from '../settings/settings.service.js';

export const rateSchema = z
  .object({
    score: z.number().int().min(1).max(5),
    comment: z.string().trim().min(2).max(500).optional(),
  })
  .strict();
export type RateInput = z.infer<typeof rateSchema>;

/**
 * Mutual ratings after a completed pickup: the charity rates the donor and
 * the donor rates the charity, once each, within rating_window_days.
 */
@Injectable()
export class RatingsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly trust: TrustService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  async rate(user: AuthUser, claimId: string, input: RateInput) {
    const s = await this.settings.all();
    const [c]: { charity_id: string; donor_id: string; status: string; picked_up_at: Date | null; title: string }[] =
      await this.db.query(
        `SELECT c.charity_id, o.donor_id, c.status, c.picked_up_at, o.title
           FROM claims c JOIN offers o ON o.id = c.offer_id WHERE c.id = $1`,
        [claimId],
      );
    const isCharity = c?.charity_id === user.orgId;
    const isDonor = c?.donor_id === user.orgId;
    if (!c || !(isCharity || isDonor)) throw new NotFoundException({ code: 'CLAIM_NOT_FOUND' });
    if (c.status !== 'PICKED_UP') throw new ConflictException({ code: 'NOT_PICKED_UP' });
    const windowEnd = new Date(c.picked_up_at!).getTime() + s.rating_window_days * 86_400_000;
    if (Date.now() > windowEnd) throw new ConflictException({ code: 'RATING_WINDOW_CLOSED' });

    const toOrgId = isCharity ? c.donor_id : c.charity_id;
    const id = await this.db
      .transaction(async (m) => {
        const [row]: { id: string }[] = await m.query(
          `INSERT INTO ratings (claim_id, from_org_id, to_org_id, score, comment)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [claimId, user.orgId, toOrgId, input.score, input.comment ?? null],
        );
        await this.audit.record(m, {
          action: 'rating.created',
          entityType: 'rating',
          entityId: row.id,
          after: { claimId, toOrgId, score: input.score, comment: input.comment ?? null },
        });
        await this.trust.recompute(m, toOrgId, { reason: 'RATING', ratingId: row.id });
        const from = await m.findOneByOrFail(Organization, { id: user.orgId! });
        await this.notifications.toOrgs(m, [toOrgId], 'rating.received', {
          claimId,
          fromName: from.name,
          score: input.score,
          title: c.title,
        });
        return row.id;
      })
      .catch((e: { code?: string }) => {
        if (e.code === '23505') throw new ConflictException({ code: 'ALREADY_RATED' });
        throw e;
      });
    return { id, claimId, score: input.score, comment: input.comment ?? null };
  }

  /** Ratings received by the caller's organization, with average and trust score. */
  async received(user: AuthUser) {
    const [summary] = await this.db.query(
      `SELECT count(*)::int AS count, round(avg(score)::numeric, 2)::float AS average,
              (SELECT trust_score::float FROM organizations WHERE id = $1) AS "trustScore"
         FROM ratings WHERE to_org_id = $1`,
      [user.orgId],
    );
    const items = await this.db.query(
      `SELECT r.score, r.comment, r.created_at AS "createdAt", r.claim_id AS "claimId", o.name AS "fromName"
         FROM ratings r JOIN organizations o ON o.id = r.from_org_id
        WHERE r.to_org_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
      [user.orgId],
    );
    return { ...summary, items };
  }

  async ratedByMe(user: AuthUser, claimId: string): Promise<boolean> {
    if (!user.orgId) return false;
    const rows = await this.db.query(`SELECT 1 FROM ratings WHERE claim_id = $1 AND from_org_id = $2`, [
      claimId,
      user.orgId,
    ]);
    return rows.length > 0;
  }
}

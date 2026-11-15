import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Organization } from './organization.entity.js';

/**
 * Trust score (0..5), used by S_trust in the matching.
 *
 *   rating part = (prior x k + sum of ratings) / (k + number of ratings)
 *   trust       = rating part - no_show_penalty x number of no-shows
 *
 * The prior (4.0, weight 3) keeps a single early rating from swinging the
 * score: one 1-star review moves a new organization from 4.0 to 3.25, not to 1.
 * Recomputed from the source data every time, so it can never drift.
 */
export function computeTrust(input: {
  prior: number;
  priorWeight: number;
  ratingSum: number;
  ratingCount: number;
  noShows: number;
  noShowPenalty: number;
}): number {
  const ratingPart = (input.prior * input.priorWeight + input.ratingSum) / (input.priorWeight + input.ratingCount);
  const t = ratingPart - input.noShowPenalty * input.noShows;
  return Math.round(Math.min(5, Math.max(0, t)) * 100) / 100;
}

@Injectable()
export class TrustService {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Recomputes and stores the trust score; audits the change. Call inside the transaction that caused it. */
  async recompute(m: EntityManager, orgId: string, reason: Record<string, unknown>) {
    const s = await this.settings.all();
    const [stats]: { sum: number; count: number; no_shows: number }[] = await m.query(
      `SELECT
         (SELECT coalesce(sum(score), 0)::float FROM ratings WHERE to_org_id = $1) AS sum,
         (SELECT count(*)::int FROM ratings WHERE to_org_id = $1) AS count,
         (SELECT count(*)::int FROM claims WHERE charity_id = $1 AND status = 'EXPIRED') AS no_shows`,
      [orgId],
    );
    const org = await m.findOne(Organization, { where: { id: orgId }, lock: { mode: 'pessimistic_write' } });
    if (!org) return;
    const next = computeTrust({
      prior: s.trust_prior,
      priorWeight: s.trust_prior_weight,
      ratingSum: stats.sum,
      ratingCount: stats.count,
      noShows: stats.no_shows,
      noShowPenalty: s.no_show_penalty,
    });
    if (next === org.trustScore) return;
    const before = org.trustScore;
    org.trustScore = next;
    await m.save(org);
    await this.audit.record(m, {
      action: 'trust_score.changed',
      entityType: 'organization',
      entityId: org.id,
      before: { trustScore: before },
      after: { trustScore: next },
      metadata: { ...reason, ratings: stats.count, noShows: stats.no_shows },
    });
  }
}

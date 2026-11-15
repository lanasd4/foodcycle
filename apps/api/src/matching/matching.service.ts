import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CHARITY_ORG_TYPES } from '@foodcycle/shared';
import { DataSource, In, type EntityManager } from 'typeorm';
import { Offer } from '../offers/offer.entities.js';
import { presentOffer } from '../offers/offer.presenter.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  evaluateMatch,
  type CharitySide,
  type Components,
  type MatchParams,
  type Reason,
  type ReasonCode,
} from './matching.rules.js';

type Perspective = 'charity' | 'donor';

const REASON_TEXT: Record<Perspective, Record<ReasonCode, (ctx: { km: number; trust: number }) => string | null>> = {
  // a charity looking at an offer
  charity: {
    NEAR: ({ km }) => `قريب منكم (${km} كم)`,
    PREFERRED_TYPE: () => 'من الأصناف التي تطلبونها',
    ACCEPTED_TYPE: () => 'صنف تقبلونه',
    QUANTITY_FITS: () => 'الكمية تناسب سعتكم اليوم',
    TIME_COMFORTABLE: () => 'وقت كافٍ للاستلام',
    TRUSTED: () => null,
  },
  // a donor looking at a charity
  donor: {
    NEAR: ({ km }) => `قريبة (${km} كم)`,
    PREFERRED_TYPE: () => 'تطلب هذا النوع',
    ACCEPTED_TYPE: () => 'تقبل هذا النوع',
    QUANTITY_FITS: () => 'الكمية تناسب سعتها',
    TIME_COMFORTABLE: () => 'تصل بوقت كافٍ',
    TRUSTED: ({ trust }) => `التزام عالٍ (${trust.toFixed(1)})`,
  },
};

function reasonTexts(reasons: Reason[], perspective: Perspective, ctx: { km: number; trust: number }) {
  return reasons.map((r) => REASON_TEXT[perspective][r.code](ctx)).filter((x): x is string => x !== null);
}

interface CharityRow {
  id: string;
  name: string;
  area: string;
  trust: number;
  distance_km: number;
  accepted_categories: number[] | null;
  preferred_categories: number[] | null;
  cap: number | null;
  pickup_start: string | null;
  pickup_end: string | null;
  used: number;
}

const hhmmToMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

function toCharitySide(r: CharityRow): CharitySide {
  return {
    distanceKm: Number(r.distance_km),
    trustScore: Number(r.trust),
    acceptedCategoryIds: r.accepted_categories,
    preferredCategoryIds: r.preferred_categories,
    capacityLeftKg: r.cap == null ? null : Math.max(0, Number(r.cap) - Number(r.used)),
    pickupWindow:
      r.pickup_start && r.pickup_end
        ? { startMin: hhmmToMin(r.pickup_start), endMin: hhmmToMin(r.pickup_end) }
        : null,
  };
}

/** SQL fragment: charity profile (needs + kg already taken today in the local time zone). */
const CHARITY_PROFILE = `
  ch.id, ch.name, ch.area, ch.trust_score::float AS trust,
  n.accepted_categories, n.preferred_categories, n.daily_capacity_kg::float AS cap,
  to_char(n.pickup_start, 'HH24:MI') AS pickup_start, to_char(n.pickup_end, 'HH24:MI') AS pickup_end,
  coalesce((
    SELECT sum(c.quantity_kg) FROM claims c
     WHERE c.charity_id = ch.id
       AND c.status IN ('PENDING_APPROVAL', 'RESERVED', 'PICKED_UP')
       AND c.created_at >= (date_trunc('day', now() AT TIME ZONE $TZ) AT TIME ZONE $TZ)
  ), 0)::float AS used`;

export interface CharityMatch {
  charityId: string;
  name: string;
  area: string;
  trustScore: number;
  distanceKm: number;
  travelMinutes: number;
  score: number;
  components: Components;
  reasons: string[];
}

@Injectable()
export class MatchingService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly settings: SettingsService,
  ) {}

  async params(now = new Date()): Promise<MatchParams & { weightsVersion: number }> {
    const s = await this.settings.all();
    return {
      now,
      serviceRadiusKm: s.service_radius_km,
      minTransportMinutes: s.min_transport_minutes,
      avgSpeedKmh: s.avg_speed_kmh,
      weights: s.weights,
      timezone: s.timezone,
      weightsVersion: s.weights_version,
    };
  }

  /**
   * Best charities for one offer (donor view, and who to notify on publish).
   * Charities that already hold an active claim on it are left out.
   */
  async charitiesForOffer(m: EntityManager, offerId: string): Promise<CharityMatch[]> {
    const p = await this.params();
    const offer = await m.findOneByOrFail(Offer, { id: offerId });
    const rows: CharityRow[] = await m.query(
      `SELECT ${CHARITY_PROFILE.replaceAll('$TZ', '$4')},
              ST_Distance(ch.location, off.location) / 1000 AS distance_km
         FROM offers off
         JOIN organizations ch
           ON ch.status = 'ACTIVE'
          AND ch.type = ANY($2::org_type[])
          AND ST_DWithin(ch.location, off.location, $3)
         LEFT JOIN charity_needs n ON n.charity_id = ch.id
        WHERE off.id = $1
          AND NOT EXISTS (
            SELECT 1 FROM claims c
             WHERE c.offer_id = off.id AND c.charity_id = ch.id
               AND c.status IN ('PENDING_APPROVAL', 'RESERVED'))`,
      [offerId, [...CHARITY_ORG_TYPES], p.serviceRadiusKm * 1000, p.timezone],
    );

    const matches: CharityMatch[] = [];
    for (const r of rows) {
      const res = evaluateMatch(offer, toCharitySide(r), p);
      if (!res.eligible) continue;
      const km = Math.round(Number(r.distance_km) * 10) / 10;
      matches.push({
        charityId: r.id,
        name: r.name,
        area: r.area,
        trustScore: Number(r.trust),
        distanceKm: km,
        travelMinutes: res.travelMinutes,
        score: res.score,
        components: res.components,
        reasons: reasonTexts(res.reasons, 'donor', { km, trust: Number(r.trust) }),
      });
    }
    return matches.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
  }

  /** Best offers for one charity ("recommended for you"), each with its score and reasons. */
  async offersForCharity(charityId: string, limit = 20) {
    const p = await this.params();
    const [profile]: CharityRow[] = await this.db.query(
      `SELECT ${CHARITY_PROFILE.replaceAll('$TZ', '$2')}, 0 AS distance_km
         FROM organizations ch LEFT JOIN charity_needs n ON n.charity_id = ch.id
        WHERE ch.id = $1`,
      [charityId, p.timezone],
    );
    const candidates: { id: string; distance_km: number }[] = await this.db.query(
      `SELECT off.id, ST_Distance(off.location, ch.location) / 1000 AS distance_km
         FROM offers off, organizations ch
        WHERE ch.id = $1
          AND off.status = 'PUBLISHED'
          AND off.remaining_kg > 0
          AND off.effective_deadline >= now() + make_interval(mins => $2)
          AND ST_DWithin(off.location, ch.location, $3)
          AND NOT EXISTS (
            SELECT 1 FROM claims c
             WHERE c.offer_id = off.id AND c.charity_id = ch.id
               AND c.status IN ('PENDING_APPROVAL', 'RESERVED'))`,
      [charityId, p.minTransportMinutes, p.serviceRadiusKm * 1000],
    );
    if (candidates.length === 0) return { items: [], weightsVersion: p.weightsVersion };

    const offers = await this.db.getRepository(Offer).find({
      where: { id: In(candidates.map((c) => c.id)) },
      relations: { category: true, donor: true },
    });
    const distance = new Map(candidates.map((c) => [c.id, Number(c.distance_km)]));
    const s = await this.settings.all();
    const ctx = {
      now: p.now,
      thresholds: { criticalMinutes: s.urgency_critical_minutes, soonMinutes: s.urgency_soon_minutes },
    };

    const scored = [];
    for (const o of offers) {
      const km = Math.round(distance.get(o.id)! * 10) / 10;
      const res = evaluateMatch(o, { ...toCharitySide(profile), distanceKm: distance.get(o.id)! }, p);
      if (!res.eligible) continue;
      scored.push({
        offer: presentOffer(o, ctx, { distanceKm: km }),
        match: {
          score: res.score,
          components: res.components,
          travelMinutes: res.travelMinutes,
          reasons: reasonTexts(res.reasons, 'charity', { km, trust: Number(profile.trust) }),
        },
      });
    }
    scored.sort((a, b) => b.match.score - a.match.score);
    const items = scored.slice(0, limit);

    await this.logSuggestions(
      this.db.manager,
      items.map((x) => ({ offerId: x.offer.id, charityId, score: x.match.score, components: x.match.components })),
      p.weightsVersion,
      'RECOMMENDED',
    );
    return { items, weightsVersion: p.weightsVersion };
  }

  // ---------------------------------------------------------------- suggestion log

  /**
   * Records suggestions so weights can be tuned later from real outcomes.
   * One row per (offer, charity): the first time it was suggested is kept.
   */
  async logSuggestions(
    m: EntityManager,
    rows: { offerId: string; charityId: string; score: number; components: Components }[],
    weightsVersion: number,
    source: 'RECOMMENDED' | 'DONOR_VIEW' | 'NOTIFIED',
  ) {
    if (rows.length === 0) return;
    await m.query(
      `INSERT INTO matching_suggestions (offer_id, charity_id, score, components, weights_version, source)
       SELECT x.offer_id, x.charity_id, x.score, x.components, $2, $3
         FROM jsonb_to_recordset($1::jsonb) AS x(offer_id uuid, charity_id uuid, score numeric, components jsonb)
       ON CONFLICT (offer_id, charity_id) DO NOTHING`,
      [
        JSON.stringify(rows.map((r) => ({ offer_id: r.offerId, charity_id: r.charityId, score: r.score, components: r.components }))),
        weightsVersion,
        source,
      ],
    );
  }

  /** A suggested charity claimed the offer. */
  async markClaimed(m: EntityManager, offerId: string, charityId: string) {
    await m.query(
      `UPDATE matching_suggestions SET outcome = 'CLAIMED', outcome_at = now()
        WHERE offer_id = $1 AND charity_id = $2 AND outcome = 'PENDING'`,
      [offerId, charityId],
    );
  }

  /** The offer ended: every suggestion still pending was not acted upon. */
  async closeForOffers(m: EntityManager, offerIds: string[], outcome: 'IGNORED' | 'OFFER_EXPIRED') {
    if (offerIds.length === 0) return;
    await m.query(
      `UPDATE matching_suggestions SET outcome = $2, outcome_at = now()
        WHERE offer_id = ANY($1::uuid[]) AND outcome = 'PENDING'`,
      [offerIds, outcome],
    );
  }
}

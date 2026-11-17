/**
 * Smart Matching — pure rules (technical plan, section 7.2). No database here:
 * every step is a plain function, unit-tested on its own.
 *
 * Stage 1, mandatory conditions (any failure = not a match):
 *   1. charity is ACTIVE (filtered in SQL)
 *   2. it accepts the food category
 *   3. it is within the service radius
 *   4. arrival time + minimum transport time fit before the offer deadline
 *   5. it still has daily capacity left
 *   6. its pickup hours overlap the window in which the food can be collected
 *
 * Stage 2, weighted score (0..1) for the charities that remain:
 *   score = w_d·S_dist + w_t·S_type + w_q·S_qty + w_p·S_time + w_r·S_trust
 */

export type Weights = { dist: number; type: number; qty: number; time: number; trust: number };
export type Components = Weights;

export interface OfferSide {
  categoryId: number;
  remainingKg: number;
  readyAt: Date;
  effectiveDeadline: Date;
}

export interface CharitySide {
  distanceKm: number;
  trustScore: number;
  /** null = charity has not filled its needs yet: accepts everything, preference unknown */
  acceptedCategoryIds: number[] | null;
  preferredCategoryIds: number[] | null;
  /** null = no daily limit declared */
  capacityLeftKg: number | null;
  /** minutes since local midnight; null = any time */
  pickupWindow: { startMin: number; endMin: number } | null;
}

export interface MatchParams {
  now: Date;
  serviceRadiusKm: number;
  minTransportMinutes: number;
  avgSpeedKmh: number;
  weights: Weights;
  timezone: string;
}

export type Ineligible =
  | 'CATEGORY_NOT_ACCEPTED'
  | 'OUT_OF_RANGE'
  | 'NOT_ENOUGH_TIME'
  | 'NO_CAPACITY_LEFT'
  | 'OUTSIDE_PICKUP_HOURS';

export type ReasonCode = 'NEAR' | 'PREFERRED_TYPE' | 'ACCEPTED_TYPE' | 'QUANTITY_FITS' | 'TIME_COMFORTABLE' | 'TRUSTED';

export interface Reason {
  code: ReasonCode;
  /** weighted contribution, used to order reasons by importance */
  weight: number;
}

export type MatchResult =
  | { eligible: false; why: Ineligible }
  | {
      eligible: true;
      score: number;
      components: Components;
      travelMinutes: number;
      reasons: Reason[];
    };

const MINUTE = 60_000;

export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function travelMinutes(distanceKm: number, avgSpeedKmh: number): number {
  return Math.ceil((distanceKm / avgSpeedKmh) * 60);
}

/**
 * Building an Intl formatter with a time zone costs ~0.2 ms, using one ~0.004 ms.
 * Matching calls this once per (offer, charity) pair, so formatters are cached.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
function hourMinuteFormatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Minutes since local midnight in the given IANA time zone. */
export function localMinuteOfDay(date: Date, timeZone: string): number {
  const parts = hourMinuteFormatter(timeZone).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')!.value);
  const m = Number(parts.find((p) => p.type === 'minute')!.value);
  return h * 60 + m;
}

/**
 * Does [from, to] touch the charity's daily pickup window at least once?
 * Handles windows that cross midnight (e.g. 20:00–02:00).
 */
export function overlapsDailyWindow(
  from: Date,
  to: Date,
  window: { startMin: number; endMin: number },
  timeZone: string,
): boolean {
  const duration = (to.getTime() - from.getTime()) / MINUTE;
  if (duration < 0) return false;
  if (duration >= 24 * 60) return true;
  const s = localMinuteOfDay(from, timeZone);
  const e = s + duration;
  const len = window.endMin > window.startMin ? window.endMin - window.startMin : window.endMin + 1440 - window.startMin;
  for (const shift of [-1440, 0, 1440]) {
    const ws = window.startMin + shift;
    if (ws <= e && ws + len >= s) return true;
  }
  return false;
}

export function evaluateMatch(offer: OfferSide, charity: CharitySide, p: MatchParams): MatchResult {
  // ---- stage 1: mandatory conditions
  if (charity.acceptedCategoryIds && !charity.acceptedCategoryIds.includes(offer.categoryId)) {
    return { eligible: false, why: 'CATEGORY_NOT_ACCEPTED' };
  }
  if (charity.distanceKm > p.serviceRadiusKm) return { eligible: false, why: 'OUT_OF_RANGE' };

  const travel = travelMinutes(charity.distanceKm, p.avgSpeedKmh);
  const remaining = (offer.effectiveDeadline.getTime() - p.now.getTime()) / MINUTE;
  if (remaining <= 0 || remaining <= travel + p.minTransportMinutes) {
    return { eligible: false, why: 'NOT_ENOUGH_TIME' };
  }
  if (charity.capacityLeftKg != null && charity.capacityLeftKg <= 0) {
    return { eligible: false, why: 'NO_CAPACITY_LEFT' };
  }
  if (charity.pickupWindow) {
    const earliest = new Date(Math.max(p.now.getTime() + travel * MINUTE, offer.readyAt.getTime()));
    if (!overlapsDailyWindow(earliest, offer.effectiveDeadline, charity.pickupWindow, p.timezone)) {
      return { eligible: false, why: 'OUTSIDE_PICKUP_HOURS' };
    }
  }

  // ---- stage 2: weighted score (each component clamped to [0, 1])
  const preferred = charity.preferredCategoryIds?.includes(offer.categoryId) ?? false;
  const c: Components = {
    dist: clamp01(1 - charity.distanceKm / p.serviceRadiusKm),
    type: preferred ? 1 : 0.5,
    qty:
      charity.capacityLeftKg == null
        ? 0.5
        : clamp01(
            1 -
              Math.abs(charity.capacityLeftKg - offer.remainingKg) /
                Math.max(charity.capacityLeftKg, offer.remainingKg),
          ),
    time: clamp01((remaining - travel) / remaining),
    trust: clamp01(charity.trustScore / 5),
  };
  const w = p.weights;
  const score = clamp01(w.dist * c.dist + w.type * c.type + w.qty * c.qty + w.time * c.time + w.trust * c.trust);

  // ---- reasons, most important first (only the genuinely good points)
  const reasons: Reason[] = [];
  if (c.dist >= 0.7) reasons.push({ code: 'NEAR', weight: w.dist * c.dist });
  reasons.push(
    preferred ? { code: 'PREFERRED_TYPE', weight: w.type } : { code: 'ACCEPTED_TYPE', weight: w.type * 0.5 },
  );
  if (charity.capacityLeftKg != null && c.qty >= 0.7) reasons.push({ code: 'QUANTITY_FITS', weight: w.qty * c.qty });
  if (c.time >= 0.8) reasons.push({ code: 'TIME_COMFORTABLE', weight: w.time * c.time });
  if (charity.trustScore >= 4.5) reasons.push({ code: 'TRUSTED', weight: w.trust * c.trust });
  reasons.sort((a, b) => b.weight - a.weight);

  return {
    eligible: true,
    score: round4(score),
    components: {
      dist: round4(c.dist),
      type: c.type,
      qty: round4(c.qty),
      time: round4(c.time),
      trust: round4(c.trust),
    },
    travelMinutes: travel,
    reasons,
  };
}

/** Weights must be non-negative and sum to 1 (±0.001). */
export function validWeights(w: Weights): boolean {
  const values = Object.values(w);
  return values.every((v) => v >= 0 && v <= 1) && Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 0.001;
}

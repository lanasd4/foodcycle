import {
  clamp01,
  evaluateMatch,
  localMinuteOfDay,
  overlapsDailyWindow,
  travelMinutes,
  validWeights,
  type CharitySide,
  type MatchParams,
  type OfferSide,
} from './matching.rules.js';

// 2026-11-15 18:00 UTC = 21:00 in Damascus (UTC+3)
const now = new Date('2026-11-15T18:00:00Z');
const min = (m: number) => new Date(now.getTime() + m * 60_000);
const hm = (h: number, m = 0) => h * 60 + m;

const params: MatchParams = {
  now,
  serviceRadiusKm: 15,
  minTransportMinutes: 30,
  avgSpeedKmh: 25,
  weights: { dist: 0.3, type: 0.2, qty: 0.2, time: 0.2, trust: 0.1 },
  timezone: 'Asia/Damascus',
};

const offer: OfferSide = { categoryId: 1, remainingKg: 10, readyAt: min(0), effectiveDeadline: min(180) };

const charity = (over: Partial<CharitySide> = {}): CharitySide => ({
  distanceKm: 3,
  trustScore: 4,
  acceptedCategoryIds: [1, 2],
  preferredCategoryIds: [1],
  capacityLeftKg: 10,
  pickupWindow: null,
  ...over,
});

describe('helpers', () => {
  it('clamp01 keeps values in [0, 1] and turns NaN into 0', () => {
    expect([clamp01(-0.2), clamp01(0.5), clamp01(1.3), clamp01(NaN)]).toEqual([0, 0.5, 1, 0]);
  });
  it('travel time from distance and average speed', () => {
    expect(travelMinutes(5, 25)).toBe(12);
    expect(travelMinutes(0, 25)).toBe(0);
  });
  it('local minute of day in Damascus', () => {
    expect(localMinuteOfDay(now, 'Asia/Damascus')).toBe(hm(21));
  });
  it('validWeights requires a sum of 1', () => {
    expect(validWeights({ dist: 0.3, type: 0.2, qty: 0.2, time: 0.2, trust: 0.1 })).toBe(true);
    expect(validWeights({ dist: 0.5, type: 0.2, qty: 0.2, time: 0.2, trust: 0.1 })).toBe(false);
    expect(validWeights({ dist: -0.1, type: 0.4, qty: 0.3, time: 0.3, trust: 0.1 })).toBe(false);
  });
});

describe('overlapsDailyWindow', () => {
  const tz = 'Asia/Damascus';
  it('21:00–23:00 overlaps an 08:00–22:00 window', () => {
    expect(overlapsDailyWindow(min(0), min(120), { startMin: hm(8), endMin: hm(22) }, tz)).toBe(true);
  });
  it('21:00–23:00 does not overlap 08:00–17:00', () => {
    expect(overlapsDailyWindow(min(0), min(120), { startMin: hm(8), endMin: hm(17) }, tz)).toBe(false);
  });
  it('a period reaching into tomorrow morning overlaps 08:00–17:00', () => {
    expect(overlapsDailyWindow(min(0), min(12 * 60), { startMin: hm(8), endMin: hm(17) }, tz)).toBe(true);
  });
  it('handles windows crossing midnight (20:00–02:00)', () => {
    expect(overlapsDailyWindow(min(0), min(30), { startMin: hm(20), endMin: hm(2) }, tz)).toBe(true);
  });
  it('anything 24h or longer always overlaps', () => {
    expect(overlapsDailyWindow(min(0), min(24 * 60), { startMin: hm(9), endMin: hm(10) }, tz)).toBe(true);
  });
});

describe('evaluateMatch — mandatory conditions', () => {
  it('category not accepted', () => {
    expect(evaluateMatch(offer, charity({ acceptedCategoryIds: [2] }), params)).toEqual({
      eligible: false,
      why: 'CATEGORY_NOT_ACCEPTED',
    });
  });
  it('charities without declared needs accept every category', () => {
    expect(evaluateMatch(offer, charity({ acceptedCategoryIds: null, preferredCategoryIds: null }), params).eligible).toBe(
      true,
    );
  });
  it('out of the service radius', () => {
    expect(evaluateMatch(offer, charity({ distanceKm: 16 }), params)).toMatchObject({ why: 'OUT_OF_RANGE' });
  });
  it('not enough time: travel + minimum transport must fit', () => {
    // 40 min left, 12 min travel + 30 min transport = 42 > 40
    const late = { ...offer, effectiveDeadline: min(40) };
    expect(evaluateMatch(late, charity({ distanceKm: 5 }), params)).toMatchObject({ why: 'NOT_ENOUGH_TIME' });
  });
  it('no daily capacity left', () => {
    expect(evaluateMatch(offer, charity({ capacityLeftKg: 0 }), params)).toMatchObject({ why: 'NO_CAPACITY_LEFT' });
  });
  it('outside pickup hours', () => {
    expect(evaluateMatch(offer, charity({ pickupWindow: { startMin: hm(8), endMin: hm(17) } }), params)).toMatchObject({
      why: 'OUTSIDE_PICKUP_HOURS',
    });
  });
});

describe('evaluateMatch — score', () => {
  it('computes each component as in the plan', () => {
    const r = evaluateMatch(offer, charity(), params);
    if (!r.eligible) throw new Error('should match');
    expect(r.components).toEqual({
      dist: 0.8, // 1 - 3/15
      type: 1, // preferred
      qty: 1, // 10 wanted, 10 offered
      time: 0.9556, // (180 - 8) / 180
      trust: 0.8, // 4 / 5
    });
    expect(r.travelMinutes).toBe(8); // ceil(3 km / 25 km/h)
    // 0.3*0.8 + 0.2*1 + 0.2*1 + 0.2*0.9556 + 0.1*0.8
    expect(r.score).toBeCloseTo(0.24 + 0.2 + 0.2 + 0.2 * (172 / 180) + 0.08, 3);
  });
  it('an accepted (not preferred) type scores 0.5', () => {
    const r = evaluateMatch({ ...offer, categoryId: 2 }, charity(), params);
    expect(r.eligible && r.components.type).toBe(0.5);
  });
  it('quantity score drops when needs and offer differ', () => {
    const r = evaluateMatch(offer, charity({ capacityLeftKg: 40 }), params);
    expect(r.eligible && r.components.qty).toBe(0.25); // 1 - 30/40
  });
  it('unknown capacity is neutral (0.5)', () => {
    const r = evaluateMatch(offer, charity({ capacityLeftKg: null }), params);
    expect(r.eligible && r.components.qty).toBe(0.5);
  });
  it('the closer charity ranks higher, all else equal', () => {
    const a = evaluateMatch(offer, charity({ distanceKm: 1 }), params);
    const b = evaluateMatch(offer, charity({ distanceKm: 10 }), params);
    expect(a.eligible && b.eligible && a.score > b.score).toBe(true);
  });
  it('reasons list the strong points, most important first', () => {
    const r = evaluateMatch(offer, charity({ distanceKm: 1, trustScore: 4.8 }), params);
    if (!r.eligible) throw new Error('should match');
    expect(r.reasons.map((x) => x.code)).toEqual(['NEAR', 'PREFERRED_TYPE', 'QUANTITY_FITS', 'TIME_COMFORTABLE', 'TRUSTED']);
  });
  it('a far charity does not get the NEAR reason', () => {
    const r = evaluateMatch(offer, charity({ distanceKm: 12 }), params);
    expect(r.eligible && r.reasons.some((x) => x.code === 'NEAR')).toBe(false);
  });
});

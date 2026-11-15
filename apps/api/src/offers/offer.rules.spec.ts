import { effectiveDeadline, remainingMinutes, resolveQuantityKg, urgencyOf, validateOffer } from './offer.rules.js';

const now = new Date('2026-11-15T18:00:00Z');
const min = (m: number) => new Date(now.getTime() + m * 60_000);
const thresholds = { criticalMinutes: 60, soonMinutes: 180 };

const cooked = { safeHours: 4, needsColdChain: true };
const bakery = { safeHours: 24, needsColdChain: false };

function valid(overrides: Partial<Parameters<typeof validateOffer>[0]> = {}) {
  return validateOffer({
    times: { preparedAt: min(-60), readyAt: min(0), pickupBy: min(120) },
    category: cooked,
    storage: 'HOT',
    allergensDeclared: true,
    now,
    minTransportMinutes: 30,
    ...overrides,
  });
}

describe('effectiveDeadline', () => {
  it('is the pickup time when food stays safe longer', () => {
    // prepared 1h ago + 4 safe hours = +3h, pickup at +2h -> pickup wins
    expect(effectiveDeadline({ preparedAt: min(-60), pickupBy: min(120) }, 4)).toEqual(min(120));
  });
  it('is the safety limit when pickup is set too late', () => {
    // prepared 3h ago + 4h = +1h, pickup at +5h -> safety wins
    expect(effectiveDeadline({ preparedAt: min(-180), pickupBy: min(300) }, 4)).toEqual(min(60));
  });
});

describe('remainingMinutes / urgency', () => {
  it('counts whole minutes and goes negative after the deadline', () => {
    expect(remainingMinutes(min(42), now)).toBe(42);
    expect(remainingMinutes(min(-5), now)).toBe(-5);
  });
  it('maps time left to CRITICAL / SOON / NORMAL', () => {
    expect(urgencyOf(min(60), now, thresholds)).toBe('CRITICAL');
    expect(urgencyOf(min(61), now, thresholds)).toBe('SOON');
    expect(urgencyOf(min(180), now, thresholds)).toBe('SOON');
    expect(urgencyOf(min(181), now, thresholds)).toBe('NORMAL');
  });
});

describe('validateOffer', () => {
  it('accepts a valid offer', () => {
    expect(valid()).toEqual([]);
  });
  it('rejects food prepared in the future, but tolerates 2 minutes of clock skew', () => {
    expect(valid({ times: { preparedAt: min(10), readyAt: min(10), pickupBy: min(120) } })).toContain(
      'PREPARED_IN_FUTURE',
    );
    expect(valid({ times: { preparedAt: min(1), readyAt: min(1), pickupBy: min(120) } })).toEqual([]);
  });
  it('rejects inconsistent times', () => {
    expect(valid({ times: { preparedAt: min(-60), readyAt: min(-90), pickupBy: min(120) } })).toContain(
      'READY_BEFORE_PREPARED',
    );
    expect(valid({ times: { preparedAt: min(-60), readyAt: min(60), pickupBy: min(60) } })).toContain(
      'PICKUP_NOT_AFTER_READY',
    );
  });
  it('rejects pickup more than 30 days ahead', () => {
    expect(
      valid({
        category: { safeHours: 10_000, needsColdChain: false },
        storage: 'ROOM_TEMP',
        times: { preparedAt: min(-1), readyAt: min(0), pickupBy: min(31 * 24 * 60) },
      }),
    ).toContain('PICKUP_TOO_FAR');
  });
  it('requires an explicit allergen declaration', () => {
    expect(valid({ allergensDeclared: false })).toContain('ALLERGENS_NOT_DECLARED');
  });
  it('refuses room temperature for food that needs temperature control', () => {
    expect(valid({ storage: 'ROOM_TEMP' })).toContain('STORAGE_NEEDS_TEMPERATURE_CONTROL');
    expect(valid({ storage: 'REFRIGERATED' })).toEqual([]);
    expect(valid({ category: bakery, storage: 'ROOM_TEMP' })).toEqual([]);
  });
  it('refuses offers without enough time left for transport', () => {
    // cooked 3h40 ago: 20 min of safe time left < 30 min transport
    expect(valid({ times: { preparedAt: min(-220), readyAt: min(-10), pickupBy: min(120) } })).toEqual([
      'TOO_CLOSE_TO_EXPIRY',
    ]);
  });
  it('returns every violation at once', () => {
    expect(valid({ allergensDeclared: false, storage: 'ROOM_TEMP' })).toEqual([
      'ALLERGENS_NOT_DECLARED',
      'STORAGE_NEEDS_TEMPERATURE_CONTROL',
    ]);
  });
});

describe('resolveQuantityKg', () => {
  it('uses kg when given', () => expect(resolveQuantityKg({ quantityKg: 12.345 }, 0.4)).toBe(12.35));
  it('converts portions with the category factor', () => expect(resolveQuantityKg({ portions: 30 }, 0.4)).toBe(12));
  it('prefers kg when both are given', () => expect(resolveQuantityKg({ quantityKg: 5, portions: 30 }, 0.4)).toBe(5));
});

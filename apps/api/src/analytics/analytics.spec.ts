import { needIndex, pctChange, periodQuery } from './analytics.service.js';

describe('pctChange', () => {
  it('computes the change in percent', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(75, 100)).toBe(-25);
  });
  it('0 -> 0 is no change; something from nothing is undefined (null)', () => {
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(10, 0)).toBeNull();
  });
});

describe('needIndex', () => {
  it('1 - received / requested', () => expect(needIndex(100, 25)).toBe(0.75));
  it('never below 0 when more was received than declared', () => expect(needIndex(100, 150)).toBe(0));
  it('unknown when nothing was declared', () => {
    expect(needIndex(null, 10)).toBeNull();
    expect(needIndex(0, 10)).toBeNull();
  });
});

describe('periodQuery', () => {
  it('defaults to the last 30 days', () => {
    const p = periodQuery.parse({});
    expect(Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000)).toBe(30);
  });
  it('rejects from >= to and ranges over a year', () => {
    expect(periodQuery.safeParse({ from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }).success).toBe(false);
    expect(periodQuery.safeParse({ from: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }).success).toBe(false);
  });
});

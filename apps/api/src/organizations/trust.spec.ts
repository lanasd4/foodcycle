import { computeTrust } from './trust.js';

const base = { prior: 4, priorWeight: 3, ratingSum: 0, ratingCount: 0, noShows: 0, noShowPenalty: 0.5 };

describe('computeTrust', () => {
  it('starts at the prior', () => expect(computeTrust(base)).toBe(4));
  it('one bad early rating does not crash the score', () =>
    expect(computeTrust({ ...base, ratingSum: 1, ratingCount: 1 })).toBe(3.25));
  it('many good ratings pull it up', () => expect(computeTrust({ ...base, ratingSum: 50, ratingCount: 10 })).toBe(4.77));
  it('each no-show costs the penalty', () => expect(computeTrust({ ...base, noShows: 1 })).toBe(3.5));
  it('stays within 0..5', () => {
    expect(computeTrust({ ...base, noShows: 20 })).toBe(0);
    expect(computeTrust({ ...base, prior: 5, ratingSum: 500, ratingCount: 100 })).toBe(5);
  });
});

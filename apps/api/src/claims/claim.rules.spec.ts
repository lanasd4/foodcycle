import { approvalDeadline, effectiveApprovalMode, reservationDeadline } from './claim.rules.js';

const now = new Date('2026-11-15T18:00:00Z');
const min = (m: number) => new Date(now.getTime() + m * 60_000);

describe('reservationDeadline', () => {
  it('holds for reservation_minutes', () => expect(reservationDeadline(now, 45, min(300))).toEqual(min(45)));
  it('never goes past the offer deadline', () => expect(reservationDeadline(now, 45, min(20))).toEqual(min(20)));
});

describe('approvalDeadline', () => {
  it('gives the donor approval_timeout_minutes', () => expect(approvalDeadline(now, 15, min(300), 30)).toEqual(min(15)));
  it('leaves the charity enough transport time', () =>
    // offer ends in 40 min, transport needs 30 -> donor must answer within 10
    expect(approvalDeadline(now, 15, min(40), 30)).toEqual(min(10)));
});

describe('effectiveApprovalMode', () => {
  it('offer override wins', () => expect(effectiveApprovalMode('MANUAL', 'AUTO')).toBe('MANUAL'));
  it('falls back to the restaurant setting', () => expect(effectiveApprovalMode(null, 'MANUAL')).toBe('MANUAL'));
});

import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorMessage, VIOLATION_TEXT } from './errors';
import { fmtCountdown, fmtKg, fmtNumber, toLocalInput } from './format';
import { toCardData } from './offer-card';
import { formatRemaining } from './utils';
import type { Offer } from './types';

describe('format', () => {
  it('kg with Latin digits and at most one decimal', () => {
    expect(fmtKg(12)).toBe('12 كغ');
    expect(fmtKg(12.345)).toBe('12.3 كغ');
    expect(fmtNumber(1234.5)).toBe('1,234.5');
  });

  it('countdown as mm:ss or h:mm:ss, never negative', () => {
    expect(fmtCountdown(65)).toBe('01:05');
    expect(fmtCountdown(3725)).toBe('1:02:05');
    expect(fmtCountdown(-10)).toBe('00:00');
  });

  it('remaining time label', () => {
    expect(formatRemaining(42)).toBe('42 د');
    expect(formatRemaining(60)).toBe('1 س');
    expect(formatRemaining(75)).toBe('1:15 س');
    expect(formatRemaining(0)).toBe('انتهى');
  });

  it('datetime-local value in local time', () => {
    expect(toLocalInput(new Date(2026, 10, 5, 9, 7))).toBe('2026-11-05T09:07');
  });
});

describe('errorMessage', () => {
  it('maps API codes to Arabic', () => {
    expect(errorMessage(new ApiError(401, 'INVALID_CREDENTIALS', {}))).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    expect(errorMessage(new ApiError(0, 'NETWORK', {}))).toMatch(/الاتصال/);
  });

  it('lists every food-safety violation', () => {
    const e = new ApiError(422, 'OFFER_RULES_VIOLATED', {
      violations: ['ALLERGENS_NOT_DECLARED', 'TOO_CLOSE_TO_EXPIRY'],
    });
    expect(errorMessage(e)).toBe(`${VIOLATION_TEXT.ALLERGENS_NOT_DECLARED} ${VIOLATION_TEXT.TOO_CLOSE_TO_EXPIRY}`);
  });

  it('shows how much is left when a claim asks for too much', () => {
    expect(errorMessage(new ApiError(409, 'INSUFFICIENT_QUANTITY', { remainingKg: 3 }))).toBe('الكمية المتاحة 3 كغ فقط.');
  });

  it('never shows raw text for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('حدث خطأ غير متوقع. حاول بعد قليل.');
    expect(errorMessage(new ApiError(418, 'SOMETHING_NEW', {}))).toBe('حدث خطأ غير متوقع. حاول بعد قليل.');
  });

  it('every food-safety rule of the API has a message', () => {
    for (const code of [
      'PREPARED_IN_FUTURE',
      'READY_BEFORE_PREPARED',
      'PICKUP_NOT_AFTER_READY',
      'PICKUP_TOO_FAR',
      'ALLERGENS_NOT_DECLARED',
      'STORAGE_NEEDS_TEMPERATURE_CONTROL',
      'TOO_CLOSE_TO_EXPIRY',
    ]) {
      expect(VIOLATION_TEXT[code]).toBeTruthy();
    }
  });
});

describe('toCardData', () => {
  it('maps an API offer to the shared card', () => {
    const offer = {
      id: 'o1',
      title: 'خبز',
      donorName: 'مخبز السنابل',
      category: { code: 'BAKERY', name: 'مخبوزات', safeHours: 24, portionKg: 0.1, needsColdChain: false },
      quantityKg: 20,
      remainingKg: 5,
      remainingMinutes: 90,
      distanceKm: 2.4,
      area: 'الشعلان',
      storageCondition: 'ROOM_TEMP',
      allergens: ['gluten'],
      photoUrl: null,
    } as unknown as Offer;
    expect(toCardData(offer)).toMatchObject({
      title: 'خبز',
      donorName: 'مخبز السنابل',
      category: 'مخبوزات',
      remainingKg: 5,
      distanceKm: 2.4,
      storage: 'ROOM_TEMP',
    });
  });
});

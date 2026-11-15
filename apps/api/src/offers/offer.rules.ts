/**
 * Pure business rules for offers (no database, no framework).
 * Kept separate so every rule is unit-tested on its own.
 * Source: technical plan, sections 4.5 and 7.1.
 */
import { urgencyFor, type StorageCondition, type Urgency } from '@foodcycle/shared';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Tolerance for clocks that are slightly ahead on the donor's phone */
export const CLOCK_SKEW_MS = 2 * MINUTE;
/** An offer cannot be scheduled further out than this */
export const MAX_PICKUP_HORIZON_MS = 30 * 24 * HOUR;

export interface OfferTimes {
  preparedAt: Date;
  readyAt: Date;
  pickupBy: Date;
}

export interface CategoryRules {
  safeHours: number;
  needsColdChain: boolean;
}

export type OfferRuleViolation =
  | 'PREPARED_IN_FUTURE'
  | 'READY_BEFORE_PREPARED'
  | 'PICKUP_NOT_AFTER_READY'
  | 'PICKUP_TOO_FAR'
  | 'ALLERGENS_NOT_DECLARED'
  | 'STORAGE_NEEDS_TEMPERATURE_CONTROL'
  | 'TOO_CLOSE_TO_EXPIRY';

/** effective_deadline = LEAST(pickup_by, prepared_at + safe_hours) */
export function effectiveDeadline(times: Pick<OfferTimes, 'preparedAt' | 'pickupBy'>, safeHours: number): Date {
  const safeUntil = times.preparedAt.getTime() + safeHours * HOUR;
  return new Date(Math.min(times.pickupBy.getTime(), safeUntil));
}

/** Whole minutes left until the deadline (negative once passed). */
export function remainingMinutes(deadline: Date, now: Date): number {
  return Math.floor((deadline.getTime() - now.getTime()) / MINUTE);
}

export function urgencyOf(
  deadline: Date,
  now: Date,
  thresholds: { criticalMinutes: number; soonMinutes: number },
): Urgency {
  return urgencyFor(remainingMinutes(deadline, now), thresholds);
}

/**
 * Checks every publication rule and returns all violations (empty = valid).
 * Returning all of them lets the UI show every problem at once.
 */
export function validateOffer(input: {
  times: OfferTimes;
  category: CategoryRules;
  storage: StorageCondition;
  allergensDeclared: boolean;
  now: Date;
  minTransportMinutes: number;
}): OfferRuleViolation[] {
  const { times, category, storage, now } = input;
  const v: OfferRuleViolation[] = [];

  if (times.preparedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) v.push('PREPARED_IN_FUTURE');
  if (times.readyAt < times.preparedAt) v.push('READY_BEFORE_PREPARED');
  if (times.pickupBy <= times.readyAt) v.push('PICKUP_NOT_AFTER_READY');
  if (times.pickupBy.getTime() > now.getTime() + MAX_PICKUP_HORIZON_MS) v.push('PICKUP_TOO_FAR');
  if (!input.allergensDeclared) v.push('ALLERGENS_NOT_DECLARED');
  if (category.needsColdChain && storage === 'ROOM_TEMP') v.push('STORAGE_NEEDS_TEMPERATURE_CONTROL');

  const deadline = effectiveDeadline(times, category.safeHours);
  if (remainingMinutes(deadline, now) < input.minTransportMinutes) v.push('TOO_CLOSE_TO_EXPIRY');

  return v;
}

/** Quantity in kg: given directly, or derived from portions × the category's portion weight. */
export function resolveQuantityKg(input: { quantityKg?: number; portions?: number }, portionKg: number): number {
  if (input.quantityKg != null) return round2(input.quantityKg);
  if (input.portions != null) return round2(input.portions * portionKg);
  throw new Error('quantityKg or portions is required');
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

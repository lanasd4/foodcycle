import type { OfferCardData } from '@/components/domain/domain';
import type { Offer } from './types';

/** API offer -> props of the shared OfferCard */
export function toCardData(o: Offer): OfferCardData {
  return {
    id: o.id,
    title: o.title,
    donorName: o.donorName ?? '',
    category: o.category?.name ?? '',
    quantityKg: o.quantityKg,
    remainingKg: o.remainingKg,
    remainingMinutes: o.remainingMinutes,
    distanceKm: o.distanceKm,
    area: o.area,
    storage: o.storageCondition,
    allergens: o.allergens,
    photoUrl: o.photoUrl,
  };
}

export const OFFER_STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'منشور',
  RESERVED: 'محجوز بالكامل',
  COMPLETED: 'مكتمل',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغى',
};

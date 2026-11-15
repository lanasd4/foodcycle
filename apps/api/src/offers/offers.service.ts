import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { diff } from '../audit/audit.util.js';
import type { AuthUser } from '../auth/auth.types.js';
import { Organization } from '../organizations/organization.entity.js';
import { SettingsService } from '../settings/settings.service.js';
import { FoodCategory, Offer } from './offer.entities.js';
import { presentCategory, presentOffer, type PresentContext } from './offer.presenter.js';
import { effectiveDeadline, resolveQuantityKg, validateOffer } from './offer.rules.js';
import type {
  BrowseOffersQuery,
  CancelOfferInput,
  CreateOfferInput,
  MyOffersQuery,
  UpdateOfferInput,
} from './offers.schemas.js';

/** Fields copied into the audit log when an offer changes */
const AUDITED_FIELDS = [
  'title',
  'description',
  'ingredients',
  'allergens',
  'allergensDeclared',
  'storageCondition',
  'storageInstructions',
  'photoUrl',
  'quantityKg',
  'remainingKg',
  'readyAt',
  'pickupBy',
  'effectiveDeadline',
  'claimApprovalMode',
  'status',
  'cancelReason',
] as const;

function snapshot(o: Offer): Record<string, unknown> {
  return Object.fromEntries(
    AUDITED_FIELDS.map((k) => {
      const v = o[k];
      return [k, v instanceof Date ? v.toISOString() : v];
    }),
  );
}

@Injectable()
export class OffersService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async categories() {
    const rows = await this.db.getRepository(FoodCategory).find({ order: { sortOrder: 'ASC' } });
    return rows.map(presentCategory);
  }

  // ------------------------------------------------------------------ donor

  async create(user: AuthUser, input: CreateOfferInput) {
    const [category, org, s] = await Promise.all([
      this.db.getRepository(FoodCategory).findOneBy({ code: input.categoryCode }),
      this.db.getRepository(Organization).findOneByOrFail({ id: user.orgId! }),
      this.settings.all(),
    ]);
    if (!category) throw new BadRequestException({ code: 'UNKNOWN_CATEGORY' });

    const now = new Date();
    const times = {
      preparedAt: new Date(input.preparedAt),
      readyAt: input.readyAt ? new Date(input.readyAt) : now,
      pickupBy: new Date(input.pickupBy),
    };
    // A donor may publish right after cooking: ready "now" can't be before preparation
    if (!input.readyAt && times.readyAt < times.preparedAt) times.readyAt = times.preparedAt;

    this.assertRules({
      times,
      category,
      storage: input.storageCondition,
      allergensDeclared: input.allergensDeclared,
      now,
      minTransportMinutes: s.min_transport_minutes,
    });

    const quantityKg = resolveQuantityKg(input, category.portionKg);
    const offer = await this.db.transaction(async (m) => {
      const saved = await m.save(
        m.create(Offer, {
          donorId: org.id,
          categoryId: category.id,
          title: input.title,
          description: input.description ?? null,
          ingredients: input.ingredients ?? null,
          allergens: input.allergens,
          allergensDeclared: input.allergensDeclared,
          storageCondition: input.storageCondition,
          storageInstructions: input.storageInstructions ?? null,
          photoUrl: input.photoUrl ?? null,
          quantityKg,
          remainingKg: quantityKg,
          portions: input.portions ?? null,
          ...times,
          effectiveDeadline: effectiveDeadline(times, category.safeHours),
          claimApprovalMode: input.claimApprovalMode ?? null,
          location: input.location
            ? { type: 'Point', coordinates: [input.location.lng, input.location.lat] }
            : org.location,
          pickupAddress: input.pickupAddress ?? org.address,
          area: input.area ?? org.area,
          status: 'PUBLISHED',
        }),
      );
      await this.audit.record(m, {
        action: 'offer.created',
        entityType: 'offer',
        entityId: saved.id,
        after: { ...snapshot(saved), category: category.code },
      });
      return saved;
    });

    return this.findAndPresent(offer.id);
  }

  async mine(user: AuthUser, q: MyOffersQuery) {
    const [rows, total] = await this.db.getRepository(Offer).findAndCount({
      where: { donorId: user.orgId!, ...(q.status ? { status: q.status } : {}) },
      relations: { category: true },
      order: { createdAt: 'DESC' },
      take: q.limit,
      skip: q.offset,
    });
    const ctx = await this.presentContext();
    return { items: rows.map((o) => presentOffer(o, ctx)), total, limit: q.limit, offset: q.offset };
  }

  /** Allowed only while the offer is PUBLISHED and nothing has been claimed from it. */
  async update(user: AuthUser, id: string, input: UpdateOfferInput) {
    const s = await this.settings.all();
    await this.db.transaction(async (m) => {
      const offer = await this.lockOwned(m, user, id);
      if (offer.status !== 'PUBLISHED' || offer.remainingKg !== offer.quantityKg) {
        throw new ConflictException({ code: 'OFFER_LOCKED' });
      }
      const category = await m.findOneByOrFail(FoodCategory, { id: offer.categoryId });
      const before = snapshot(offer);

      const { readyAt, pickupBy, quantityKg, ...rest } = input;
      Object.assign(offer, rest);
      if (readyAt) offer.readyAt = new Date(readyAt);
      if (pickupBy) offer.pickupBy = new Date(pickupBy);
      if (quantityKg != null) {
        offer.quantityKg = quantityKg;
        offer.remainingKg = quantityKg;
      }

      this.assertRules({
        times: offer,
        category,
        storage: offer.storageCondition,
        allergensDeclared: offer.allergensDeclared,
        now: new Date(),
        minTransportMinutes: s.min_transport_minutes,
      });
      offer.effectiveDeadline = effectiveDeadline(offer, category.safeHours);

      const changes = diff(before, snapshot(offer));
      if (!changes) return;
      await m.save(offer);
      await this.audit.record(m, { action: 'offer.updated', entityType: 'offer', entityId: offer.id, ...changes });
    });
    return this.findAndPresent(id);
  }

  async cancel(user: AuthUser, id: string, input: CancelOfferInput) {
    await this.db.transaction(async (m) => {
      const offer = await this.lockOwned(m, user, id);
      if (offer.status !== 'PUBLISHED' && offer.status !== 'RESERVED') {
        throw new ConflictException({ code: 'OFFER_NOT_CANCELLABLE', status: offer.status });
      }
      // Phase 3: active claims on this offer move to CANCELLED_BY_DONOR here, in the same transaction.
      const before = { status: offer.status, cancelReason: offer.cancelReason };
      offer.status = 'CANCELLED';
      offer.cancelReason = input.reason ?? null;
      await m.save(offer);
      await this.audit.record(m, {
        action: 'offer.cancelled',
        entityType: 'offer',
        entityId: offer.id,
        before,
        after: { status: offer.status, cancelReason: offer.cancelReason },
      });
    });
    return this.findAndPresent(id);
  }

  // ------------------------------------------------------------------ charity

  /**
   * Expiry Priority browse: published offers that still leave enough time to
   * transport the food, most urgent first. The time filter is part of the query
   * itself, so an offer never shows up late just because the expiry job has not
   * run yet.
   */
  async browse(user: AuthUser, q: BrowseOffersQuery) {
    const s = await this.settings.all();
    const orgLocation = `(SELECT location FROM organizations WHERE id = :orgId)`;

    const qb = this.db
      .getRepository(Offer)
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.category', 'c')
      .innerJoinAndSelect('o.donor', 'd')
      .addSelect(`ST_Distance(o.location, ${orgLocation}) / 1000`, 'distance_km')
      .where(`o.status = 'PUBLISHED'`)
      .andWhere('o.remainingKg > 0')
      .andWhere(`o.effectiveDeadline >= now() + make_interval(mins => :minT)`)
      .setParameters({ orgId: user.orgId, minT: s.min_transport_minutes });

    if (q.category) qb.andWhere('c.code = :cat', { cat: q.category });
    if (q.maxKm) qb.andWhere(`ST_DWithin(o.location, ${orgLocation}, :meters)`, { meters: q.maxKm * 1000 });
    if (q.excludeAllergens?.length) {
      qb.andWhere('NOT (o.allergens && ARRAY[:...ex]::text[])', { ex: q.excludeAllergens });
    }
    if (q.minKg) qb.andWhere('o.remainingKg >= :minKg', { minKg: q.minKg });
    if (q.area) qb.andWhere('o.area = :area', { area: q.area });

    const total = await qb.getCount();
    const { entities, raw } = await qb
      .orderBy('o.effectiveDeadline', 'ASC')
      .addOrderBy('o.id', 'ASC')
      .offset(q.offset)
      .limit(q.limit)
      .getRawAndEntities<{ distance_km: string }>();

    const ctx = await this.presentContext();
    return {
      items: entities.map((o, i) => presentOffer(o, ctx, { distanceKm: Number(raw[i].distance_km) })),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  }

  // ------------------------------------------------------------------ shared

  /** Donor owner and admin see any status; charities only see live offers. */
  async getOne(user: AuthUser, id: string) {
    const offer = await this.db
      .getRepository(Offer)
      .findOne({ where: { id }, relations: { category: true, donor: true } });
    const visible =
      offer &&
      (user.role === 'ADMIN' ||
        offer.donorId === user.orgId ||
        (user.role === 'CHARITY' && (offer.status === 'PUBLISHED' || offer.status === 'RESERVED')));
    if (!visible) throw new NotFoundException({ code: 'OFFER_NOT_FOUND' });
    return presentOffer(offer, await this.presentContext());
  }

  // ------------------------------------------------------------------ helpers

  private assertRules(input: Parameters<typeof validateOffer>[0]) {
    const violations = validateOffer(input);
    if (violations.length) throw new UnprocessableEntityException({ code: 'OFFER_RULES_VIOLATED', violations });
  }

  /** Locks the offer row; a donor touching someone else's offer gets 404, not 403. */
  private async lockOwned(m: EntityManager, user: AuthUser, id: string) {
    const offer = await m.findOne(Offer, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!offer || offer.donorId !== user.orgId) throw new NotFoundException({ code: 'OFFER_NOT_FOUND' });
    return offer;
  }

  private async findAndPresent(id: string) {
    const offer = await this.db
      .getRepository(Offer)
      .findOneOrFail({ where: { id }, relations: { category: true, donor: true } });
    return presentOffer(offer, await this.presentContext());
  }

  private async presentContext(): Promise<PresentContext> {
    const s = await this.settings.all();
    return {
      now: new Date(),
      thresholds: { criticalMinutes: s.urgency_critical_minutes, soonMinutes: s.urgency_soon_minutes },
    };
  }
}

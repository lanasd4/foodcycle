import { randomBytes, randomInt } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ClaimStatus } from '@foodcycle/shared';
import { DataSource, In, type EntityManager } from 'typeorm';
import type { AuditAction } from '../audit/audit.actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { MatchingService } from '../matching/matching.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Offer } from '../offers/offer.entities.js';
import { Organization } from '../organizations/organization.entity.js';
import { TrustService } from '../organizations/trust.js';
import { SettingsService } from '../settings/settings.service.js';
import { ACTIVE_CLAIM_STATUSES, Claim } from './claim.entity.js';
import { presentClaim } from './claim.presenter.js';
import { approvalDeadline, effectiveApprovalMode, reservationDeadline } from './claim.rules.js';
import type { ConfirmPickupInput, CreateClaimInput, ListClaimsQuery, RejectClaimInput } from './claims.schemas.js';

type Ends = Extract<
  ClaimStatus,
  'REJECTED' | 'APPROVAL_TIMEOUT' | 'EXPIRED' | 'CANCELLED_BY_CHARITY' | 'CANCELLED_BY_DONOR'
>;

const END_ACTION: Record<Ends, AuditAction> = {
  REJECTED: 'claim.rejected',
  APPROVAL_TIMEOUT: 'claim.approval_timeout',
  EXPIRED: 'claim.expired',
  CANCELLED_BY_CHARITY: 'claim.cancelled',
  CANCELLED_BY_DONOR: 'claim.cancelled',
};

/**
 * Claims = a charity reserving a quantity of an offer.
 *
 * Locking order (always the same, so two transactions can never deadlock):
 *   1. the offer row   2. the claim row   3. the charity organization row
 * Every state change re-checks the status after taking the locks.
 */
@Injectable()
export class ClaimsService {
  private readonly log = new Logger(ClaimsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly matching: MatchingService,
    private readonly trust: TrustService,
  ) {}

  // =================================================================== charity

  async create(user: AuthUser, offerId: string, input: CreateClaimInput) {
    const s = await this.settings.all();
    const claimId = await this.db.transaction(async (m) => {
      // 1. lock the offer: concurrent claims on it queue up here
      const offer = await m.findOne(Offer, { where: { id: offerId }, lock: { mode: 'pessimistic_write' } });
      if (!offer || (offer.status !== 'PUBLISHED' && offer.status !== 'RESERVED')) {
        throw new NotFoundException({ code: 'OFFER_NOT_FOUND' });
      }
      const now = new Date();
      if (offer.status !== 'PUBLISHED' || offer.remainingKg <= 0) {
        throw new ConflictException({ code: 'OFFER_NOT_AVAILABLE' });
      }
      if (offer.effectiveDeadline.getTime() - now.getTime() < s.min_transport_minutes * 60_000) {
        throw new ConflictException({ code: 'OFFER_EXPIRING' });
      }
      if (input.quantityKg > offer.remainingKg) {
        throw new ConflictException({ code: 'INSUFFICIENT_QUANTITY', remainingKg: offer.remainingKg });
      }

      // 3. lock the charity: its parallel claims on other offers queue up here (active-claims limit)
      const charity = await m.findOneOrFail(Organization, {
        where: { id: user.orgId! },
        lock: { mode: 'pessimistic_write' },
      });
      const active = await m.find(Claim, {
        where: { charityId: user.orgId!, status: In(ACTIVE_CLAIM_STATUSES) },
        select: { id: true, offerId: true },
      });
      if (active.some((c) => c.offerId === offer.id)) throw new ConflictException({ code: 'ALREADY_CLAIMED' });
      if (active.length >= s.max_active_claims_per_charity) {
        throw new ConflictException({ code: 'TOO_MANY_ACTIVE_CLAIMS', limit: s.max_active_claims_per_charity });
      }

      const donor = await m.findOneByOrFail(Organization, { id: offer.donorId });
      const mode = effectiveApprovalMode(offer.claimApprovalMode, donor.claimApprovalMode);

      offer.remainingKg = Math.round((offer.remainingKg - input.quantityKg) * 100) / 100;
      if (offer.remainingKg === 0) offer.status = 'RESERVED';
      await m.save(offer);

      const claim = m.create(Claim, {
        offerId: offer.id,
        charityId: user.orgId!,
        quantityKg: input.quantityKg,
        approvalModeApplied: mode,
      });
      if (mode === 'AUTO') {
        claim.status = 'RESERVED';
        Object.assign(claim, this.reservationFields(m, now, s.reservation_minutes, offer));
      } else {
        claim.status = 'PENDING_APPROVAL';
        claim.approvalDeadline = approvalDeadline(
          now,
          s.approval_timeout_minutes,
          offer.effectiveDeadline,
          s.min_transport_minutes,
        );
      }
      if (claim.status === 'RESERVED') await this.assignPickupCode(m, claim);
      const saved = await m.save(claim);
      await this.matching.markClaimed(m, offer.id, saved.charityId);

      await this.audit.record(m, {
        action: 'claim.created',
        entityType: 'claim',
        entityId: saved.id,
        after: {
          offerId: offer.id,
          quantityKg: saved.quantityKg,
          status: saved.status,
          approvalMode: mode,
          approvalDeadline: saved.approvalDeadline?.toISOString() ?? null,
          reservedUntil: saved.reservedUntil?.toISOString() ?? null,
          offerRemainingKg: offer.remainingKg,
        },
      });
      if (saved.status === 'PENDING_APPROVAL') {
        await this.notifications.toOrgs(m, [offer.donorId], 'claim.pending_approval', {
          claimId: saved.id,
          offerId: offer.id,
          title: offer.title,
          charityName: charity.name,
          quantityKg: saved.quantityKg,
          minutesToAnswer: Math.max(1, Math.round((saved.approvalDeadline!.getTime() - now.getTime()) / 60_000)),
        });
      } else {
        await this.notifications.toOrgs(m, [offer.donorId], 'claim.reserved', {
          claimId: saved.id,
          offerId: offer.id,
          title: offer.title,
          charityName: charity.name,
          quantityKg: saved.quantityKg,
        });
      }
      return saved.id;
    });
    return this.getOne(user, claimId);
  }

  async cancelByCharity(user: AuthUser, claimId: string) {
    await this.withLockedClaim(claimId, async (m, claim, offer) => {
      if (claim.charityId !== user.orgId) throw new NotFoundException({ code: 'CLAIM_NOT_FOUND' });
      if (!ACTIVE_CLAIM_STATUSES.includes(claim.status)) {
        throw new ConflictException({ code: 'CLAIM_NOT_ACTIVE', status: claim.status });
      }
      await this.end(m, claim, offer, 'CANCELLED_BY_CHARITY', { returnQuantity: true });
    });
    return this.getOne(user, claimId);
  }

  async mine(user: AuthUser, q: ListClaimsQuery) {
    return this.list(q, { charityId: user.orgId! }, user);
  }

  // =================================================================== donor

  async incoming(user: AuthUser, q: ListClaimsQuery) {
    return this.list(q, { offer: { donorId: user.orgId! } }, user);
  }

  async approve(user: AuthUser, claimId: string) {
    const s = await this.settings.all();
    await this.withLockedClaim(claimId, async (m, claim, offer) => {
      if (offer.donorId !== user.orgId) throw new NotFoundException({ code: 'CLAIM_NOT_FOUND' });
      if (claim.status !== 'PENDING_APPROVAL') {
        throw new ConflictException({ code: 'CLAIM_NOT_PENDING', status: claim.status });
      }
      const now = new Date();
      // The sweep may not have run yet: an elapsed deadline is final either way
      if (claim.approvalDeadline && claim.approvalDeadline <= now) {
        throw new ConflictException({ code: 'APPROVAL_WINDOW_CLOSED' });
      }
      claim.status = 'RESERVED';
      claim.decidedAt = now;
      claim.decidedBy = user.id;
      // the pickup countdown starts from the approval, not from the request
      Object.assign(claim, this.reservationFields(m, now, s.reservation_minutes, offer));
      await this.assignPickupCode(m, claim);
      await m.save(claim);
      await this.audit.record(m, {
        action: 'claim.approved',
        entityType: 'claim',
        entityId: claim.id,
        before: { status: 'PENDING_APPROVAL' },
        after: { status: 'RESERVED', reservedUntil: claim.reservedUntil!.toISOString() },
      });
      const { donorName } = await this.names(m, claim, offer);
      await this.notifications.toOrgs(m, [claim.charityId], 'claim.approved', {
        claimId: claim.id,
        offerId: offer.id,
        title: offer.title,
        donorName,
        quantityKg: claim.quantityKg,
        minutesToPickup: Math.max(1, Math.round((claim.reservedUntil!.getTime() - now.getTime()) / 60_000)),
      });
    });
    return this.getOne(user, claimId);
  }

  async reject(user: AuthUser, claimId: string, input: RejectClaimInput) {
    await this.withLockedClaim(claimId, async (m, claim, offer) => {
      if (offer.donorId !== user.orgId) throw new NotFoundException({ code: 'CLAIM_NOT_FOUND' });
      if (claim.status !== 'PENDING_APPROVAL') {
        throw new ConflictException({ code: 'CLAIM_NOT_PENDING', status: claim.status });
      }
      claim.decidedAt = new Date();
      claim.decidedBy = user.id;
      claim.rejectReason = input.reason ?? null;
      // rejection is the donor's call: no penalty for the charity
      await this.end(m, claim, offer, 'REJECTED', { returnQuantity: true, metadata: { reason: claim.rejectReason } });
    });
    return this.getOne(user, claimId);
  }

  /**
   * The donor scans the charity's QR code (or types the 6-digit code).
   * Only the donor of that offer can confirm, and only a RESERVED claim.
   */
  async confirmPickup(user: AuthUser, input: ConfirmPickupInput) {
    const byQr = 'qrToken' in input;
    const qb = this.db
      .getRepository(Claim)
      .createQueryBuilder('c')
      .innerJoin('c.offer', 'o')
      .select(['c.id'])
      .where('o.donorId = :donor', { donor: user.orgId });
    if (byQr) qb.andWhere('c.qrToken = :t', { t: input.qrToken.replace(/^FC1:/, '') });
    else qb.andWhere('c.offerId = :oid AND c.pickupCode = :code', { oid: input.offerId, code: input.pickupCode });
    qb.andWhere(`c.status = 'RESERVED'`);
    const found = await qb.getOne();
    // Same answer for "no such code" and "not your offer": nothing to probe
    if (!found) throw new NotFoundException({ code: 'PICKUP_CODE_INVALID' });

    await this.withLockedClaim(found.id, async (m, claim, offer) => {
      if (claim.status !== 'RESERVED') throw new NotFoundException({ code: 'PICKUP_CODE_INVALID' });
      const now = new Date();
      claim.status = 'PICKED_UP';
      claim.pickedUpAt = now;
      claim.closedAt = now;
      claim.qrToken = null; // single use
      claim.pickupCode = null;
      await m.save(claim);
      await this.completeOfferIfDone(m, offer);
      await this.audit.record(m, {
        action: 'claim.picked_up',
        entityType: 'claim',
        entityId: claim.id,
        before: { status: 'RESERVED' },
        after: { status: 'PICKED_UP' },
        metadata: { method: byQr ? 'QR' : 'CODE', quantityKg: claim.quantityKg, offerId: offer.id },
      });
      await this.notifications.toOrgs(m, [claim.charityId], 'claim.picked_up', {
        claimId: claim.id,
        offerId: offer.id,
        title: offer.title,
        quantityKg: claim.quantityKg,
      });
    });
    return this.getOne(user, found.id);
  }

  // =================================================================== shared

  /** Charity owner sees its secrets (QR, code); the offer's donor and admins see the claim without them. */
  async getOne(user: AuthUser, id: string) {
    const claim = await this.db.getRepository(Claim).findOne({
      where: { id },
      relations: { offer: { donor: true }, charity: true },
    });
    const isCharity = claim?.charityId === user.orgId;
    const isDonor = claim?.offer?.donorId === user.orgId;
    if (!claim || !(isCharity || isDonor || user.role === 'ADMIN')) {
      throw new NotFoundException({ code: 'CLAIM_NOT_FOUND' });
    }
    return presentClaim(claim, {
      now: new Date(),
      withSecrets: isCharity && claim.status === 'RESERVED' ? await this.secretsOf(id) : undefined,
    });
  }

  // =================================================================== used by other modules

  /** Offer cancelled by the donor: every active claim ends, no penalty for charities. */
  async cancelAllForOffer(m: EntityManager, offer: Offer) {
    const claims = await m.find(Claim, {
      where: { offerId: offer.id, status: In(ACTIVE_CLAIM_STATUSES) },
      lock: { mode: 'pessimistic_write' },
    });
    for (const c of claims) await this.end(m, c, offer, 'CANCELLED_BY_DONOR', { returnQuantity: false });
    return claims.length;
  }

  /**
   * Sweep run by the maintenance job:
   *  - PENDING_APPROVAL past approval_deadline -> APPROVAL_TIMEOUT (no penalty)
   *  - RESERVED past reserved_until            -> EXPIRED (no-show: trust penalty)
   * Each claim is handled in its own transaction with the usual locking order,
   * so a claim approved or picked up at the same moment is simply skipped.
   */
  async sweepExpired(): Promise<{ approvalTimeouts: number; noShows: number }> {
    const due: { id: string; status: ClaimStatus }[] = await this.db.query(
      `SELECT id, status FROM claims
        WHERE (status = 'PENDING_APPROVAL' AND approval_deadline <= now())
           OR (status = 'RESERVED' AND reserved_until <= now())
        ORDER BY created_at
        LIMIT 500`,
    );
    const s = await this.settings.all();
    let approvalTimeouts = 0;
    let noShows = 0;

    for (const { id } of due) {
      try {
        await this.withLockedClaim(id, async (m, claim, offer) => {
          const now = new Date();
          if (claim.status === 'PENDING_APPROVAL' && claim.approvalDeadline! <= now) {
            await this.end(m, claim, offer, 'APPROVAL_TIMEOUT', { returnQuantity: true });
            approvalTimeouts++;
          } else if (claim.status === 'RESERVED' && claim.reservedUntil! <= now) {
            await this.end(m, claim, offer, 'EXPIRED', { returnQuantity: true });
            await this.trust.recompute(m, claim.charityId, { reason: 'NO_SHOW', claimId: claim.id });
            noShows++;
          }
          // otherwise: changed since we listed it (approved, picked up...) -> skip
        });
      } catch (e) {
        this.log.error(`Sweep failed for claim ${id}: ${(e as Error).message}`);
      }
    }
    return { approvalTimeouts, noShows };
  }

  // =================================================================== internals

  /** Locks offer then claim (fixed order), re-reads both, and runs fn in one transaction. */
  private async withLockedClaim(
    claimId: string,
    fn: (m: EntityManager, claim: Claim, offer: Offer) => Promise<void>,
  ) {
    const ref = await this.db.getRepository(Claim).findOne({ where: { id: claimId }, select: { id: true, offerId: true } });
    if (!ref) throw new NotFoundException({ code: 'CLAIM_NOT_FOUND' });
    await this.db.transaction(async (m) => {
      const offer = await m.findOneOrFail(Offer, { where: { id: ref.offerId }, lock: { mode: 'pessimistic_write' } });
      const claim = await m
        .getRepository(Claim)
        .createQueryBuilder('c')
        .addSelect(['c.qrToken', 'c.pickupCode'])
        .where('c.id = :id', { id: claimId })
        .setLock('pessimistic_write')
        .getOneOrFail();
      await fn(m, claim, offer);
    });
  }

  /** Ends a claim, optionally gives its quantity back to the offer, and audits it. */
  private async end(
    m: EntityManager,
    claim: Claim,
    offer: Offer,
    status: Ends,
    opts: { returnQuantity: boolean; metadata?: Record<string, unknown> },
  ) {
    const before = claim.status;
    claim.status = status;
    claim.closedAt = new Date();
    claim.qrToken = null;
    claim.pickupCode = null;
    await m.save(claim);

    if (opts.returnQuantity) {
      offer.remainingKg = Math.round((offer.remainingKg + claim.quantityKg) * 100) / 100;
      // A fully reserved offer becomes available again. If it is now too late to
      // transport, the offer expiry job will expire it on its next run.
      if (offer.status === 'RESERVED') offer.status = 'PUBLISHED';
      await m.save(offer);
    }
    await this.audit.record(m, {
      action: END_ACTION[status],
      entityType: 'claim',
      entityId: claim.id,
      before: { status: before },
      after: { status },
      metadata: {
        offerId: offer.id,
        quantityKg: claim.quantityKg,
        quantityReturned: opts.returnQuantity,
        ...opts.metadata,
      },
    });
    await this.notifyEnd(m, claim, offer, status);
  }

  /** Who hears about a claim that ended, and what they are told. */
  private async notifyEnd(m: EntityManager, claim: Claim, offer: Offer, status: Ends) {
    const { charityName, donorName } = await this.names(m, claim, offer);
    const base = { claimId: claim.id, offerId: offer.id, title: offer.title };
    const n = this.notifications;
    switch (status) {
      case 'REJECTED':
        return n.toOrgs(m, [claim.charityId], 'claim.rejected', { ...base, donorName, reason: claim.rejectReason });
      case 'APPROVAL_TIMEOUT':
        await n.toOrgs(m, [claim.charityId], 'claim.approval_timeout.charity', { ...base, donorName });
        return n.toOrgs(m, [offer.donorId], 'claim.approval_timeout.donor', { ...base, charityName });
      case 'EXPIRED':
        await n.toOrgs(m, [claim.charityId], 'claim.expired.charity', base);
        return n.toOrgs(m, [offer.donorId], 'claim.expired.donor', {
          ...base,
          charityName,
          quantityKg: claim.quantityKg,
        });
      case 'CANCELLED_BY_CHARITY':
        return n.toOrgs(m, [offer.donorId], 'claim.cancelled_by_charity', {
          ...base,
          charityName,
          quantityKg: claim.quantityKg,
        });
      case 'CANCELLED_BY_DONOR':
        return n.toOrgs(m, [claim.charityId], 'claim.cancelled_by_donor', { ...base, donorName });
    }
  }

  private async names(m: EntityManager, claim: Claim, offer: Offer) {
    const orgs = await m.find(Organization, {
      where: { id: In([claim.charityId, offer.donorId]) },
      select: { id: true, name: true },
    });
    const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? '';
    return { charityName: name(claim.charityId), donorName: name(offer.donorId) };
  }

  private reservationFields(_m: EntityManager, now: Date, minutes: number, offer: Offer) {
    return {
      reservedUntil: reservationDeadline(now, minutes, offer.effectiveDeadline),
      qrToken: randomBytes(24).toString('base64url'),
    };
  }

  /** 6-digit code, unique among the live reservations of the same offer. */
  private async assignPickupCode(m: EntityManager, claim: Claim) {
    const taken = new Set(
      (
        await m.query(`SELECT pickup_code FROM claims WHERE offer_id = $1 AND status = 'RESERVED'`, [claim.offerId])
      ).map((r: { pickup_code: string }) => r.pickup_code),
    );
    let code: string;
    do code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    while (taken.has(code));
    claim.pickupCode = code;
  }

  /** Offer becomes COMPLETED when nothing is left and no claim is still active. */
  private async completeOfferIfDone(m: EntityManager, offer: Offer) {
    if (offer.status !== 'RESERVED' || offer.remainingKg > 0) return;
    const stillActive = await m.count(Claim, { where: { offerId: offer.id, status: In(ACTIVE_CLAIM_STATUSES) } });
    if (stillActive === 0) {
      offer.status = 'COMPLETED';
      await m.save(offer);
      await this.matching.closeForOffers(m, [offer.id], 'IGNORED');
    }
  }

  private async secretsOf(id: string) {
    const row = await this.db
      .getRepository(Claim)
      .createQueryBuilder('c')
      .select(['c.id', 'c.qrToken', 'c.pickupCode'])
      .where('c.id = :id', { id })
      .getOneOrFail();
    return { qrToken: row.qrToken, pickupCode: row.pickupCode };
  }

  private async list(q: ListClaimsQuery, where: Record<string, unknown>, user: AuthUser) {
    const [rows, total] = await this.db.getRepository(Claim).findAndCount({
      where: { ...where, ...(q.status ? { status: q.status } : {}) },
      relations: { offer: { donor: true }, charity: true },
      order: { createdAt: 'DESC' },
      take: q.limit,
      skip: q.offset,
    });
    const now = new Date();
    const items = [];
    for (const c of rows) {
      const isCharity = c.charityId === user.orgId;
      items.push(
        presentClaim(c, {
          now,
          withSecrets: isCharity && c.status === 'RESERVED' ? await this.secretsOf(c.id) : undefined,
        }),
      );
    }
    return { items, total, limit: q.limit, offset: q.offset };
  }

}

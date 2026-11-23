import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuditAction } from '../audit/audit.actions.js';
import { AuditService } from '../audit/audit.service.js';
import { diff } from '../audit/audit.util.js';
import type { AuthUser } from '../auth/auth.types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Organization } from './organization.entity.js';
import { presentOrganization } from './organization.presenter.js';
import type { ListOrgsQuery, UpdateSettingsInput, VerifyInput } from './organizations.schemas.js';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async getMine(user: AuthUser) {
    if (!user.orgId) throw new NotFoundException({ code: 'NO_ORGANIZATION' });
    return presentOrganization(await this.db.getRepository(Organization).findOneByOrFail({ id: user.orgId }));
  }

  /** Donor settings: currently the claim approval mode (AUTO or MANUAL). */
  async updateSettings(user: AuthUser, input: UpdateSettingsInput) {
    const orgId = user.orgId;
    if (user.role !== 'DONOR' || !orgId) throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED' });

    return this.db.transaction(async (m) => {
      const org = await m.findOne(Organization, { where: { id: orgId }, lock: { mode: 'pessimistic_write' } });
      if (!org) throw new NotFoundException({ code: 'NO_ORGANIZATION' });

      const before = { claimApprovalMode: org.claimApprovalMode };
      org.claimApprovalMode = input.claimApprovalMode;
      const changes = diff(before, { claimApprovalMode: org.claimApprovalMode });
      if (changes) {
        await m.save(org);
        await this.audit.record(m, {
          action: 'org.settings.updated',
          entityType: 'organization',
          entityId: org.id,
          ...changes,
        });
      }
      return presentOrganization(org);
    });
  }

  async list(q: ListOrgsQuery) {
    const [rows, total] = await this.db.getRepository(Organization).findAndCount({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.city ? { city: q.city } : {}) },
      order: { createdAt: 'ASC' },
      take: q.limit,
      skip: q.offset,
    });
    return { items: rows.map(presentOrganization), total, limit: q.limit, offset: q.offset };
  }

  /**
   * Admin verification transitions:
   *   PENDING_VERIFICATION -> ACTIVE      (org.verified)
   *   PENDING_VERIFICATION -> SUSPENDED   (org.suspended, rejects the registration)
   *   ACTIVE               -> SUSPENDED   (org.suspended)
   *   SUSPENDED            -> ACTIVE      (org.reactivated)
   * Suspending always needs a reason.
   */
  async setStatus(admin: AuthUser, orgId: string, input: VerifyInput) {
    return this.db.transaction(async (m) => {
      const org = await m.findOne(Organization, { where: { id: orgId }, lock: { mode: 'pessimistic_write' } });
      if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });
      if (org.status === input.status) throw new ConflictException({ code: 'STATUS_UNCHANGED' });
      if (input.status === 'SUSPENDED' && !input.reason) {
        throw new BadRequestException({ code: 'REASON_REQUIRED' });
      }

      let action: AuditAction;
      if (input.status === 'SUSPENDED') action = 'org.suspended';
      else if (org.status === 'PENDING_VERIFICATION') action = 'org.verified';
      else action = 'org.reactivated';

      const before = { status: org.status, statusReason: org.statusReason };
      org.status = input.status;
      org.statusReason = input.reason ?? null;
      if (action === 'org.verified') {
        org.verifiedAt = new Date();
        org.verifiedBy = admin.id;
      }
      await m.save(org);
      await this.audit.record(m, {
        action,
        entityType: 'organization',
        entityId: org.id,
        before,
        after: { status: org.status, statusReason: org.statusReason },
      });
      if (action === 'org.suspended') {
        await this.notifications.toOrgs(m, [org.id], 'org.suspended', { orgId: org.id, reason: org.statusReason });
      } else {
        await this.notifications.toOrgs(m, [org.id], action, { orgId: org.id });
      }
      return presentOrganization(org);
    });
  }
}

import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { setActor } from '../common/request-context.js';
import { Organization } from '../organizations/organization.entity.js';
import { presentOrganization } from '../organizations/organization.presenter.js';
import { User } from '../users/user.entity.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import type { JwtPayload } from './auth.types.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Donor or charity self-registration. The organization starts PENDING_VERIFICATION. */
  async register(input: RegisterInput) {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const { user, org } = await this.db.transaction(async (m) => {
      const exists = await m.exists(User, { where: { email: input.email } });
      if (exists) throw new ConflictException({ code: 'EMAIL_TAKEN' });

      const user = await m.save(m.create(User, { email: input.email, passwordHash, role: input.role }));
      const o = input.organization;
      const org = await m.save(
        m.create(Organization, {
          userId: user.id,
          name: o.name,
          type: o.type,
          phone: o.phone,
          address: o.address,
          city: o.city,
          area: o.area,
          location: { type: 'Point', coordinates: [o.location.lng, o.location.lat] },
          registrationNumber: o.registrationNumber ?? null,
        }),
      );

      setActor(user.id, user.role);
      await this.audit.record(m, {
        action: 'auth.register',
        entityType: 'user',
        entityId: user.id,
        after: { email: user.email, role: user.role, organizationId: org.id, orgType: org.type, orgName: org.name },
      });
      await this.notifications.toAdmins(m, 'org.pending_verification', { orgId: org.id, name: org.name, type: org.type });
      return { user, org };
    }).catch((e: unknown) => {
      // unique index race: two registrations with the same email at the same time
      if ((e as { code?: string }).code === '23505') throw new ConflictException({ code: 'EMAIL_TAKEN' });
      throw e;
    });

    const fresh = await this.db.getRepository(Organization).findOneByOrFail({ id: org.id });
    return this.session(user, presentOrganization(fresh));
  }

  async login(input: LoginInput) {
    const user = await this.db
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = :email', { email: input.email })
      .getOne();

    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await this.audit.recordStandalone({
        action: 'auth.login.failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        metadata: { email: input.email, reason: user ? 'BAD_PASSWORD' : 'UNKNOWN_EMAIL' },
        actor: { userId: null, role: 'ANONYMOUS' },
      });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    await this.db.transaction(async (m) => {
      await m.update(User, { id: user.id }, { lastLoginAt: new Date() });
      await this.audit.record(m, {
        action: 'auth.login.success',
        entityType: 'user',
        entityId: user.id,
        actor: { userId: user.id, role: user.role },
      });
    });

    const org = await this.db.getRepository(Organization).findOneBy({ userId: user.id });
    return this.session(user, org ? presentOrganization(org) : null);
  }

  async me(userId: string) {
    const user = await this.db.getRepository(User).findOneByOrFail({ id: userId });
    const org = await this.db.getRepository(Organization).findOneBy({ userId });
    return { user: this.presentUser(user), organization: org ? presentOrganization(org) : null };
  }

  private async session(user: User, organization: ReturnType<typeof presentOrganization> | null) {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.presentUser(user),
      organization,
    };
  }

  private presentUser(u: User) {
    return { id: u.id, email: u.email, role: u.role };
  }
}

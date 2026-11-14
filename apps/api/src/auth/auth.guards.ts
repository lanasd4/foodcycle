import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Role } from '@foodcycle/shared';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { setActor } from '../common/request-context.js';
import { IS_PUBLIC, REQUIRE_ACTIVE_ORG, ROLES } from './auth.decorators.js';
import type { AuthUser, JwtPayload } from './auth.types.js';

/**
 * Global guard #1 — authentication.
 * Verifies the bearer token, then reloads the user and organization status
 * from the database so a suspension takes effect on the very next request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID' });
    }

    const rows: { id: string; email: string; role: Role; org_id: string | null; org_status: AuthUser['orgStatus'] }[] =
      await this.db.query(
        `SELECT u.id, u.email, u.role, o.id AS org_id, o.status AS org_status
           FROM users u LEFT JOIN organizations o ON o.user_id = u.id
          WHERE u.id = $1`,
        [payload.sub],
      );
    const row = rows[0];
    if (!row) throw new UnauthorizedException({ code: 'TOKEN_INVALID' });

    req.user = { id: row.id, email: row.email, role: row.role, orgId: row.org_id, orgStatus: row.org_status };
    setActor(row.id, row.role);
    return true;
  }
}

/** Global guard #2 — role-based access control (@Roles). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED' });
    return true;
  }
}

/** Global guard #3 — organization must be verified (@RequireActiveOrg). */
@Injectable()
export class ActiveOrgGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_ACTIVE_ORG, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user?.role === 'ADMIN') return true;
    if (user?.orgStatus !== 'ACTIVE') {
      throw new ForbiddenException({
        code: user?.orgStatus === 'SUSPENDED' ? 'ORG_SUSPENDED' : 'ORG_NOT_VERIFIED',
      });
    }
    return true;
  }
}

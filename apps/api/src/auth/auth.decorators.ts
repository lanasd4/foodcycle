import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@foodcycle/shared';
import type { AuthUser } from './auth.types.js';

export const IS_PUBLIC = 'fc:isPublic';
export const ROLES = 'fc:roles';
export const REQUIRE_ACTIVE_ORG = 'fc:requireActiveOrg';

/** Route needs no JWT. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route is limited to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Route needs the caller's organization to be verified (ACTIVE). */
export const RequireActiveOrg = () => SetMetadata(REQUIRE_ACTIVE_ORG, true);

/** The authenticated caller. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

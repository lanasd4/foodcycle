import type { OrgStatus, Role } from '@foodcycle/shared';

export interface JwtPayload {
  sub: string;
  role: Role;
}

/** Attached to the request by JwtAuthGuard (always read fresh from the DB). */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  orgId: string | null;
  orgStatus: OrgStatus | null;
}

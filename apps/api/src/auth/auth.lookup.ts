import type { JwtService } from '@nestjs/jwt';
import type { Role } from '@foodcycle/shared';
import type { DataSource } from 'typeorm';
import type { AuthUser, JwtPayload } from './auth.types.js';

/**
 * Verifies a JWT and reloads the user and organization status from the
 * database. Shared by the HTTP guard and the WebSocket gateway.
 * Returns null for any invalid or unknown token.
 */
export async function resolveAuthUser(jwt: JwtService, db: DataSource, token: string): Promise<AuthUser | null> {
  let payload: JwtPayload;
  try {
    payload = await jwt.verifyAsync<JwtPayload>(token);
  } catch {
    return null;
  }
  const rows: { id: string; email: string; role: Role; org_id: string | null; org_status: AuthUser['orgStatus'] }[] =
    await db.query(
      `SELECT u.id, u.email, u.role, o.id AS org_id, o.status AS org_status
         FROM users u LEFT JOIN organizations o ON o.user_id = u.id
        WHERE u.id = $1`,
      [payload.sub],
    );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, role: row.role, orgId: row.org_id, orgStatus: row.org_status };
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthUser } from '../auth/auth.types.js';
import { renderNotification, type NotificationData, type NotificationType } from './notification.templates.js';
import { z } from 'zod';

export const listNotificationsQuery = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** id of the last item of the previous page */
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;

export interface NotificationRow {
  id: string;
  recipient_org_id: string | null;
  recipient_user_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

export function presentNotification(r: NotificationRow) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    data: r.data,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

/**
 * Writes notifications. Always pass the transaction manager of the change
 * being announced: the row (and its real-time push) exists only if that
 * change commits.
 */
@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async toOrgs<T extends NotificationType>(m: EntityManager, orgIds: string[], type: T, data: NotificationData[T]) {
    if (orgIds.length === 0) return;
    const { title, body } = renderNotification(type, data);
    await m.query(
      `INSERT INTO notifications (recipient_org_id, type, title, body, data)
       SELECT unnest($1::uuid[]), $2, $3, $4, $5`,
      [orgIds, type, title, body, data],
    );
  }

  async toAdmins<T extends NotificationType>(m: EntityManager, type: T, data: NotificationData[T]) {
    const { title, body } = renderNotification(type, data);
    await m.query(
      `INSERT INTO notifications (recipient_user_id, type, title, body, data)
       SELECT id, $1, $2, $3, $4 FROM users WHERE role = 'ADMIN'`,
      [type, title, body, data],
    );
  }

  // ------------------------------------------------------------------ reading

  async list(user: AuthUser, q: ListNotificationsQuery) {
    const params: unknown[] = [user.orgId, user.id, q.limit + 1];
    let extra = '';
    if (q.unreadOnly) extra += ' AND read_at IS NULL';
    if (q.cursor) {
      params.push(q.cursor);
      extra += ` AND id < $${params.length}`;
    }
    const rows: NotificationRow[] = await this.db.query(
      `SELECT * FROM notifications
        WHERE (recipient_org_id = $1 OR recipient_user_id = $2) ${extra}
        ORDER BY id DESC
        LIMIT $3`,
      params,
    );
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map(presentNotification);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async unreadCount(user: AuthUser) {
    const [{ n }] = await this.db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE (recipient_org_id = $1 OR recipient_user_id = $2) AND read_at IS NULL`,
      [user.orgId, user.id],
    );
    return { unread: n as number };
  }

  async markRead(user: AuthUser, id: string) {
    const rows: { id: string }[] = await this.db.query(
      `WITH upd AS (
         UPDATE notifications SET read_at = coalesce(read_at, now())
          WHERE id = $1 AND (recipient_org_id = $2 OR recipient_user_id = $3)
         RETURNING id
       ) SELECT id FROM upd`,
      [id, user.orgId, user.id],
    );
    if (rows.length === 0) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    return this.unreadCount(user);
  }

  async markAllRead(user: AuthUser) {
    await this.db.query(
      `UPDATE notifications SET read_at = now()
        WHERE (recipient_org_id = $1 OR recipient_user_id = $2) AND read_at IS NULL`,
      [user.orgId, user.id],
    );
    return { unread: 0 };
  }

  /** Used by the real-time listener */
  async byId(id: string): Promise<NotificationRow | null> {
    const rows: NotificationRow[] = await this.db.query(`SELECT * FROM notifications WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
}

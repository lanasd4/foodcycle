import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { currentContext } from '../common/request-context.js';
import type { AuditAction, AuditEntityType } from './audit.actions.js';
import { AuditLog } from './audit-log.entity.js';
import { redact } from './audit.util.js';

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /** Override the actor (e.g. a login, before the JWT exists) */
  actor?: { userId: string | null; role: string };
}

@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Writes an audit entry using the given transaction manager, so the entry
   * commits or rolls back together with the change it describes.
   */
  async record(manager: EntityManager, entry: AuditEntry): Promise<void> {
    const ctx = currentContext();
    const row = manager.create(AuditLog, {
      actorUserId: entry.actor ? entry.actor.userId : (ctx.actorUserId ?? null),
      actorRole: entry.actor ? entry.actor.role : ctx.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: (entry.before ? redact(entry.before) : null) as Record<string, any> | null,
      after: (entry.after ? redact(entry.after) : null) as Record<string, any> | null,
      metadata: (entry.metadata ? redact(entry.metadata) : null) as Record<string, any> | null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      requestId: ctx.requestId,
    } as AuditLog);
    // plain INSERT (no RETURNING/reload): the table is append-only
    await manager.createQueryBuilder().insert().into(AuditLog).values(row).updateEntity(false).execute();
  }

  /** For events with no business transaction (e.g. failed logins). */
  async recordStandalone(entry: AuditEntry): Promise<void> {
    await this.record(this.dataSource.manager, entry);
  }
}

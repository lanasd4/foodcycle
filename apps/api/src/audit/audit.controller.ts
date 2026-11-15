import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { AuditLog } from './audit-log.entity.js';

const auditQuery = z.object({
  entityType: z.string().max(32).optional(),
  entityId: z.string().max(64).optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  /** id of the last row of the previous page (results are newest first) */
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
type AuditQuery = z.infer<typeof auditQuery>;

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get()
  @Roles('ADMIN')
  async list(@Query({ schema: auditQuery }) q: AuditQuery) {
    const qb = this.db
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .orderBy('a.id', 'DESC')
      .take(q.limit + 1);
    if (q.entityType) qb.andWhere('a.entityType = :et', { et: q.entityType });
    if (q.entityId) qb.andWhere('a.entityId = :eid', { eid: q.entityId });
    if (q.actorId) qb.andWhere('a.actorUserId = :aid', { aid: q.actorId });
    if (q.action) qb.andWhere('a.action = :ac', { ac: q.action });
    if (q.from) qb.andWhere('a.occurredAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('a.occurredAt < :to', { to: q.to });
    if (q.cursor) qb.andWhere('a.id < :cursor', { cursor: q.cursor });

    const rows = await qb.getMany();
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';

/**
 * Moves PUBLISHED offers to EXPIRED once there is no longer enough time to
 * transport the food (effective_deadline - min_transport has passed).
 *
 * Safe to run concurrently or twice: the UPDATE only matches rows that are
 * still PUBLISHED, and Postgres re-checks that condition after waiting for
 * any row lock, so an offer is never expired (or audited) twice.
 *
 * Active claims are not touched: each one keeps its own pickup window
 * (reserved_until is never later than the offer deadline) and is ended by
 * the claims sweep. A fully reserved offer (RESERVED) is not expired here;
 * if its claims end, it returns to PUBLISHED and is expired on the next run.
 */
@Injectable()
export class OfferExpiryService {
  private readonly log = new Logger(OfferExpiryService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async expireDue(): Promise<number> {
    const s = await this.settings.all();
    const expired = await this.db.transaction(async (m) => {
      // Wrapped in a CTE: TypeORM returns [rows, count] for a bare UPDATE ... RETURNING,
      // but plain rows for a SELECT.
      const rows: { id: string; effective_deadline: Date; remaining_kg: string }[] = await m.query(
        `WITH expired AS (
           UPDATE offers
              SET status = 'EXPIRED', updated_at = now()
            WHERE status = 'PUBLISHED'
              AND effective_deadline < now() + make_interval(mins => $1)
          RETURNING id, effective_deadline, remaining_kg
         )
         SELECT * FROM expired`,
        [s.min_transport_minutes],
      );
      for (const r of rows) {
        await this.audit.record(m, {
          action: 'offer.expired',
          entityType: 'offer',
          entityId: r.id,
          before: { status: 'PUBLISHED' },
          after: { status: 'EXPIRED' },
          metadata: {
            effectiveDeadline: new Date(r.effective_deadline).toISOString(),
            remainingKg: Number(r.remaining_kg),
          },
          actor: { userId: null, role: 'SYSTEM' },
        });
      }
      return rows.length;
    });
    if (expired) this.log.log(`Expired ${expired} offer(s)`);
    return expired;
  }
}

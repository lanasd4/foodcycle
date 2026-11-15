import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { diff } from '../audit/audit.util.js';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { validWeights } from '../matching/matching.rules.js';
import { SettingsService } from './settings.service.js';

const minutes = (max: number) => z.number().int().min(1).max(max);

const validTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Everything an admin may tune. weights_version is managed by the server. */
export const updateSettingsSchema = z
  .object({
    reservation_minutes: minutes(24 * 60),
    approval_timeout_minutes: minutes(24 * 60),
    min_transport_minutes: minutes(6 * 60),
    service_radius_km: z.number().positive().max(200),
    urgency_critical_minutes: minutes(24 * 60),
    urgency_soon_minutes: minutes(7 * 24 * 60),
    max_active_claims_per_charity: z.number().int().min(1).max(50),
    no_show_penalty: z.number().min(0).max(5),
    avg_speed_kmh: z.number().positive().max(120),
    timezone: z.string().refine(validTimeZone, 'Unknown IANA time zone'),
    trust_prior: z.number().min(0).max(5),
    trust_prior_weight: z.number().min(0).max(100),
    rating_window_days: z.number().int().min(1).max(90),
    max_offer_notifications: z.number().int().min(0).max(500),
    weights: z
      .object({
        dist: z.number().min(0).max(1),
        type: z.number().min(0).max(1),
        qty: z.number().min(0).max(1),
        time: z.number().min(0).max(1),
        trust: z.number().min(0).max(1),
      })
      .strict()
      .refine(validWeights, 'Weights must sum to 1'),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/settings')
export class SettingsController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles('ADMIN')
  get() {
    this.settings.invalidate();
    return this.settings.all();
  }

  /**
   * Changing the weights bumps weights_version, so every suggestion logged
   * afterwards can be compared with those made under the previous weights.
   */
  @Patch()
  @Roles('ADMIN')
  async update(@CurrentUser() admin: AuthUser, @Body({ schema: updateSettingsSchema }) body: UpdateSettingsInput) {
    this.settings.invalidate();
    const current = await this.settings.all();
    const merged = { ...current, ...body };
    if (merged.urgency_critical_minutes >= merged.urgency_soon_minutes) {
      throw new BadRequestException({ code: 'INVALID_THRESHOLDS', message: 'critical must be below soon' });
    }

    await this.db.transaction(async (m) => {
      await m.query(`SELECT 1 FROM app_settings WHERE key = 'weights_version' FOR UPDATE`);
      const { weights, ...others } = body;

      const otherChanges = diff(
        Object.fromEntries(Object.keys(others).map((k) => [k, current[k as keyof typeof current]])),
        others,
      );
      if (otherChanges) {
        for (const [key, value] of Object.entries(otherChanges.after)) await this.write(m, key, value, admin.id);
        await this.audit.record(m, { action: 'settings.updated', entityType: 'settings', entityId: null, ...otherChanges });
      }

      const weightChanges = weights ? diff({ weights: current.weights }, { weights }) : null;
      if (weightChanges) {
        const version = current.weights_version + 1;
        await this.write(m, 'weights', weights, admin.id);
        await this.write(m, 'weights_version', version, admin.id);
        await this.audit.record(m, {
          action: 'settings.weights.updated',
          entityType: 'settings',
          entityId: 'weights',
          before: { ...weightChanges.before, weightsVersion: current.weights_version },
          after: { ...weightChanges.after, weightsVersion: version },
        });
      }
    });

    this.settings.invalidate();
    return this.settings.all();
  }

  private write(m: import('typeorm').EntityManager, key: string, value: unknown, by: string) {
    return m.query(`UPDATE app_settings SET value = $2, updated_at = now(), updated_by = $3 WHERE key = $1`, [
      key,
      JSON.stringify(value),
      by,
    ]);
  }
}

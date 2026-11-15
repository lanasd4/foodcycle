import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface AppSettings {
  reservation_minutes: number;
  approval_timeout_minutes: number;
  min_transport_minutes: number;
  service_radius_km: number;
  urgency_critical_minutes: number;
  urgency_soon_minutes: number;
  max_active_claims_per_charity: number;
  weights: { dist: number; type: number; qty: number; time: number; trust: number };
  weights_version: number;
  no_show_penalty: number;
}

const CACHE_MS = 30_000;

/**
 * Reads app_settings (tunable values such as thresholds and matching weights).
 * Cached for 30 seconds: changes made by an admin apply within half a minute.
 */
@Injectable()
export class SettingsService {
  private cache: { at: number; value: AppSettings } | null = null;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async all(): Promise<AppSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const rows: { key: string; value: unknown }[] = await this.db.query(`SELECT key, value FROM app_settings`);
    const value = Object.fromEntries(rows.map((r) => [r.key, r.value])) as unknown as AppSettings;
    this.cache = { at: Date.now(), value };
    return value;
  }

  invalidate() {
    this.cache = null;
  }
}

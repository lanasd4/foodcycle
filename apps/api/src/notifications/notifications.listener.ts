import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import type { Env } from '../config/env.js';
import { NotificationsGateway, orgRoom, userRoom } from './notifications.gateway.js';
import { NotificationsService, presentNotification } from './notifications.service.js';

const CHANNEL = 'fc_notifications';

/**
 * Bridges Postgres to Socket.IO.
 *
 * The notifications insert trigger calls pg_notify, which Postgres delivers
 * only after the transaction commits. This listener receives the id, loads
 * the row and pushes it to the recipient's room.
 *
 * Several API instances can run side by side: each one listens and pushes to
 * the sockets connected to it, so no extra pub/sub (like a Redis adapter) is needed.
 */
@Injectable()
export class NotificationsListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(NotificationsListener.name);
  private client: pg.Client | null = null;
  private stopped = false;
  private retryMs = 1000;

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    private readonly gateway: NotificationsGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async onApplicationBootstrap() {
    await this.connect();
  }

  async onApplicationShutdown() {
    this.stopped = true;
    await this.client?.end().catch(() => undefined);
  }

  private async connect() {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: this.cfg.get('DATABASE_URL', { infer: true }) });
    client.on('notification', (msg) => {
      if (msg.channel === CHANNEL && msg.payload) void this.push(msg.payload);
    });
    client.on('error', (e) => this.reconnect(client, e));
    client.on('end', () => this.reconnect(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
      this.retryMs = 1000;
    } catch (e) {
      this.reconnect(client, e as Error);
    }
  }

  private reconnect(client: pg.Client, e?: Error) {
    if (this.stopped || this.client !== client && this.client !== null) return;
    this.client = null;
    client.removeAllListeners();
    void client.end().catch(() => undefined);
    this.log.warn(`Notification listener disconnected${e ? `: ${e.message}` : ''}; retrying in ${this.retryMs} ms`);
    setTimeout(() => void this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
  }

  private async push(id: string) {
    try {
      const row = await this.notifications.byId(id);
      if (!row) return;
      const room = row.recipient_org_id ? orgRoom(row.recipient_org_id) : userRoom(row.recipient_user_id!);
      this.gateway.emitTo(room, 'notification', presentNotification(row));
    } catch (e) {
      this.log.error(`Failed to push notification ${id}: ${(e as Error).message}`);
    }
  }
}

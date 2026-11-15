import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { runWithContext } from '../common/request-context.js';
import type { Env } from '../config/env.js';
import { OfferExpiryService } from '../offers/offer-expiry.service.js';

export const MAINTENANCE_QUEUE = 'maintenance';
export const EXPIRE_OFFERS_JOB = 'expire-offers';

/**
 * Worker for recurring maintenance jobs. Starts only when JOBS_ENABLED=true,
 * so scripts (like seed-admin) can boot the app without consuming jobs.
 */
@Processor(MAINTENANCE_QUEUE, { autorun: false })
export class MaintenanceProcessor extends WorkerHost {
  private readonly log = new Logger('Jobs');

  constructor(private readonly expiry: OfferExpiryService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    return runWithContext({ requestId: `job:${job.name}:${job.id}`, actorRole: 'SYSTEM' }, async () => {
      switch (job.name) {
        case EXPIRE_OFFERS_JOB:
          return { expired: await this.expiry.expireDue() };
        default:
          this.log.warn(`Unknown job ${job.name}`);
          return null;
      }
    });
  }
}

/** Registers the recurring schedules and starts the worker on boot. */
@Injectable()
export class JobsBootstrap implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly processor: MaintenanceProcessor,
    private readonly cfg: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap() {
    if (!this.cfg.get('JOBS_ENABLED', { infer: true })) return;
    // upsert: re-deploying never creates duplicate schedules
    await this.queue.upsertJobScheduler(
      EXPIRE_OFFERS_JOB,
      { every: 60_000 },
      { name: EXPIRE_OFFERS_JOB, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    void this.processor.worker.run();
  }
}

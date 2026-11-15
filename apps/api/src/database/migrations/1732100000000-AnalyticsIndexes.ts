import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 7: indexes for Impact Analytics (aggregations over completed pickups). */
export class AnalyticsIndexes1732100000000 implements MigrationInterface {
  name = 'AnalyticsIndexes1732100000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX claims_picked_up_at_idx ON claims (picked_up_at) WHERE status = 'PICKED_UP'`);
    await q.query(`CREATE INDEX offers_created_at_idx ON offers (created_at)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS offers_created_at_idx`);
    await q.query(`DROP INDEX IF EXISTS claims_picked_up_at_idx`);
  }
}

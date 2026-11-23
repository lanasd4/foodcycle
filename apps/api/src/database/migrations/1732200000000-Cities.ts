import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Multi-city: every organization belongs to one city. Existing data was all in Damascus. */
export class Cities1732200000000 implements MigrationInterface {
  name = 'Cities1732200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE city AS ENUM ('DAMASCUS', 'ALEPPO')`);
    await q.query(`ALTER TABLE organizations ADD COLUMN city city NOT NULL DEFAULT 'DAMASCUS'`);
    await q.query(`CREATE INDEX organizations_city_idx ON organizations (city)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS organizations_city_idx`);
    await q.query(`ALTER TABLE organizations DROP COLUMN city`);
    await q.query(`DROP TYPE city`);
  }
}

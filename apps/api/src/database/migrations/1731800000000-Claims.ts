import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 schema: claims (reservations of a quantity from an offer).
 */
export class Claims1731800000000 implements MigrationInterface {
  name = 'Claims1731800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE claim_status AS ENUM (
        'PENDING_APPROVAL', 'RESERVED', 'PICKED_UP', 'REJECTED',
        'APPROVAL_TIMEOUT', 'EXPIRED', 'CANCELLED_BY_CHARITY', 'CANCELLED_BY_DONOR'
      )`);

    await q.query(`
      CREATE TABLE claims (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        offer_id              uuid NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
        charity_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        quantity_kg           numeric(8,2) NOT NULL CHECK (quantity_kg > 0),
        status                claim_status NOT NULL,
        approval_mode_applied claim_approval_mode NOT NULL,
        approval_deadline     timestamptz,
        decided_at            timestamptz,
        decided_by            uuid REFERENCES users(id),
        reject_reason         varchar(500),
        reserved_until        timestamptz,
        qr_token              varchar(64),
        pickup_code           char(6),
        picked_up_at          timestamptz,
        closed_at             timestamptz,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        CHECK (approval_mode_applied = 'AUTO' OR approval_deadline IS NOT NULL),
        CHECK (status <> 'RESERVED' OR (reserved_until IS NOT NULL AND qr_token IS NOT NULL AND pickup_code IS NOT NULL))
      )`);

    // A charity holds at most one active claim per offer
    await q.query(`
      CREATE UNIQUE INDEX claims_one_active_per_offer_uq ON claims (offer_id, charity_id)
        WHERE status IN ('PENDING_APPROVAL', 'RESERVED')`);
    await q.query(`CREATE UNIQUE INDEX claims_qr_token_uq ON claims (qr_token) WHERE qr_token IS NOT NULL`);
    // Short manual codes only need to be unique among the live reservations of one offer
    await q.query(`
      CREATE UNIQUE INDEX claims_pickup_code_uq ON claims (offer_id, pickup_code) WHERE status = 'RESERVED'`);
    await q.query(`CREATE INDEX claims_charity_idx ON claims (charity_id, created_at DESC)`);
    await q.query(`CREATE INDEX claims_offer_idx ON claims (offer_id)`);
    // Sweeps
    await q.query(`CREATE INDEX claims_pending_deadline_idx ON claims (approval_deadline) WHERE status = 'PENDING_APPROVAL'`);
    await q.query(`CREATE INDEX claims_reserved_until_idx ON claims (reserved_until) WHERE status = 'RESERVED'`);

    await q.query(`INSERT INTO app_settings (key, value) VALUES ('no_show_penalty', '0.5')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM app_settings WHERE key = 'no_show_penalty'`);
    await q.query(`DROP TABLE IF EXISTS claims`);
    await q.query(`DROP TYPE IF EXISTS claim_status`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5: charity needs, matching suggestions log, ratings.
 */
export class MatchingAndRatings1732000000000 implements MigrationInterface {
  name = 'MatchingAndRatings1732000000000';

  async up(q: QueryRunner): Promise<void> {
    // ---------- charity_needs: what a charity accepts and when it can pick up ----------
    await q.query(`
      CREATE TABLE charity_needs (
        charity_id           uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
        accepted_categories  smallint[] NOT NULL,
        preferred_categories smallint[] NOT NULL DEFAULT '{}',
        daily_capacity_kg    numeric(8,2) CHECK (daily_capacity_kg IS NULL OR daily_capacity_kg > 0),
        pickup_start         time,
        pickup_end           time,
        updated_at           timestamptz NOT NULL DEFAULT now(),
        CHECK (cardinality(accepted_categories) > 0),
        CHECK (preferred_categories <@ accepted_categories),
        CHECK ((pickup_start IS NULL) = (pickup_end IS NULL))
      )`);

    // ---------- matching_suggestions: every suggestion shown, and what happened next ----------
    await q.query(`CREATE TYPE suggestion_outcome AS ENUM ('PENDING', 'CLAIMED', 'IGNORED', 'OFFER_EXPIRED')`);
    await q.query(`
      CREATE TABLE matching_suggestions (
        id              bigserial PRIMARY KEY,
        offer_id        uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
        charity_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        score           numeric(5,4) NOT NULL,
        components      jsonb NOT NULL,
        weights_version integer NOT NULL,
        source          varchar(16) NOT NULL,
        suggested_at    timestamptz NOT NULL DEFAULT now(),
        outcome         suggestion_outcome NOT NULL DEFAULT 'PENDING',
        outcome_at      timestamptz,
        UNIQUE (offer_id, charity_id)
      )`);
    await q.query(`CREATE INDEX matching_suggestions_pending_idx ON matching_suggestions (offer_id) WHERE outcome = 'PENDING'`);

    // ---------- ratings: one per side per completed pickup ----------
    await q.query(`
      CREATE TABLE ratings (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        claim_id    uuid NOT NULL REFERENCES claims(id) ON DELETE RESTRICT,
        from_org_id uuid NOT NULL REFERENCES organizations(id),
        to_org_id   uuid NOT NULL REFERENCES organizations(id),
        score       smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
        comment     varchar(500),
        created_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (claim_id, from_org_id),
        CHECK (from_org_id <> to_org_id)
      )`);
    await q.query(`CREATE INDEX ratings_to_org_idx ON ratings (to_org_id, created_at DESC)`);

    await q.query(`
      INSERT INTO app_settings (key, value) VALUES
        ('avg_speed_kmh',            '25'),
        ('timezone',                 '"Asia/Damascus"'),
        ('trust_prior',              '4'),
        ('trust_prior_weight',       '3'),
        ('rating_window_days',       '7'),
        ('max_offer_notifications',  '20')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM app_settings WHERE key IN ('avg_speed_kmh','timezone','trust_prior','trust_prior_weight','rating_window_days','max_offer_notifications')`,
    );
    await q.query(`DROP TABLE IF EXISTS ratings`);
    await q.query(`DROP TABLE IF EXISTS matching_suggestions`);
    await q.query(`DROP TYPE IF EXISTS suggestion_outcome`);
    await q.query(`DROP TABLE IF EXISTS charity_needs`);
  }
}

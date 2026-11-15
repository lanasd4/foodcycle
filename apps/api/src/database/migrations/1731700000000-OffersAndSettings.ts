import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 schema: food categories, app settings, offers.
 */
export class OffersAndSettings1731700000000 implements MigrationInterface {
  name = 'OffersAndSettings1731700000000';

  async up(q: QueryRunner): Promise<void> {
    // ---------- food_categories (fixed list, managed by migrations) ----------
    await q.query(`
      CREATE TABLE food_categories (
        id               smallserial PRIMARY KEY,
        code             varchar(32) NOT NULL UNIQUE,
        name             varchar(80) NOT NULL,
        safe_hours       numeric(6,2) NOT NULL CHECK (safe_hours > 0),
        portion_kg       numeric(6,3) NOT NULL CHECK (portion_kg > 0),
        needs_cold_chain boolean NOT NULL DEFAULT false,
        sort_order       smallint NOT NULL DEFAULT 0
      )`);
    // needs_cold_chain = needs temperature control: cannot be stored at room temperature.
    await q.query(`
      INSERT INTO food_categories (code, name, safe_hours, portion_kg, needs_cold_chain, sort_order) VALUES
        ('COOKED',     'وجبات مطبوخة',        4,   0.400, true,  1),
        ('SANDWICHES', 'سندويشات ووجبات جاهزة', 6,   0.300, true,  2),
        ('DAIRY',      'ألبان وأجبان',         12,  0.200, true,  3),
        ('BAKERY',     'مخبوزات',              24,  0.100, false, 4),
        ('DESSERTS',   'حلويات',               24,  0.150, false, 5),
        ('PRODUCE',    'خضار وفواكه',          48,  0.250, false, 6),
        ('BEVERAGES',  'مشروبات',              168, 0.500, false, 7),
        ('CANNED',     'معلبات',               720, 0.400, false, 8),
        ('DRY_GOODS',  'مواد جافة',            720, 1.000, false, 9)`);

    // ---------- app_settings (key/value, tunable without code changes) ----------
    await q.query(`
      CREATE TABLE app_settings (
        key        varchar(64) PRIMARY KEY,
        value      jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users(id)
      )`);
    await q.query(`
      INSERT INTO app_settings (key, value) VALUES
        ('reservation_minutes',      '45'),
        ('approval_timeout_minutes', '15'),
        ('min_transport_minutes',    '30'),
        ('service_radius_km',        '15'),
        ('urgency_critical_minutes', '60'),
        ('urgency_soon_minutes',     '180'),
        ('max_active_claims_per_charity', '3'),
        ('weights', '{"dist":0.30,"type":0.20,"qty":0.20,"time":0.20,"trust":0.10}'),
        ('weights_version', '1')`);

    // ---------- offers ----------
    await q.query(`CREATE TYPE offer_status AS ENUM ('PUBLISHED', 'RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED')`);
    await q.query(`CREATE TYPE storage_condition AS ENUM ('ROOM_TEMP', 'HOT', 'REFRIGERATED', 'FROZEN')`);
    await q.query(`
      CREATE TABLE offers (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        donor_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        category_id          smallint NOT NULL REFERENCES food_categories(id),
        title                varchar(120) NOT NULL,
        description          varchar(1000),
        ingredients          varchar(1000),
        allergens            text[] NOT NULL DEFAULT '{}',
        allergens_declared   boolean NOT NULL CHECK (allergens_declared),
        storage_condition    storage_condition NOT NULL,
        storage_instructions varchar(500),
        photo_url            varchar(500),
        quantity_kg          numeric(8,2) NOT NULL CHECK (quantity_kg > 0),
        remaining_kg         numeric(8,2) NOT NULL CHECK (remaining_kg >= 0 AND remaining_kg <= quantity_kg),
        portions             integer CHECK (portions IS NULL OR portions > 0),
        prepared_at          timestamptz NOT NULL,
        ready_at             timestamptz NOT NULL,
        pickup_by            timestamptz NOT NULL,
        effective_deadline   timestamptz NOT NULL,
        claim_approval_mode  claim_approval_mode,
        location             geography(Point, 4326) NOT NULL,
        pickup_address       varchar(300) NOT NULL,
        area                 varchar(120) NOT NULL,
        status               offer_status NOT NULL DEFAULT 'PUBLISHED',
        cancel_reason        varchar(500),
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now(),
        CHECK (ready_at >= prepared_at),
        CHECK (pickup_by > ready_at),
        CHECK (effective_deadline <= pickup_by),
        CHECK (allergens <@ ARRAY['gluten','dairy','eggs','nuts','peanuts','soy','fish','shellfish','sesame']::text[])
      )`);
    // Browse query: published offers ordered by deadline
    await q.query(
      `CREATE INDEX offers_published_deadline_idx ON offers (effective_deadline) WHERE status = 'PUBLISHED'`,
    );
    await q.query(`CREATE INDEX offers_location_gix ON offers USING GIST (location)`);
    await q.query(`CREATE INDEX offers_donor_idx ON offers (donor_id, created_at DESC)`);
    await q.query(`CREATE INDEX offers_allergens_gin ON offers USING GIN (allergens)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS offers`);
    await q.query(`DROP TYPE IF EXISTS storage_condition`);
    await q.query(`DROP TYPE IF EXISTS offer_status`);
    await q.query(`DROP TABLE IF EXISTS app_settings`);
    await q.query(`DROP TABLE IF EXISTS food_categories`);
  }
}

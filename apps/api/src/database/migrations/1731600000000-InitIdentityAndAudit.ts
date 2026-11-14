import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 schema: users, organizations, audit_logs.
 * Written as plain SQL on purpose: PostGIS types, partial behaviour and
 * the append-only trigger are clearer here than in entity metadata.
 */
export class InitIdentityAndAudit1731600000000 implements MigrationInterface {
  name = 'InitIdentityAndAudit1731600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    await q.query(`CREATE TYPE user_role AS ENUM ('DONOR', 'CHARITY', 'ADMIN')`);
    await q.query(
      `CREATE TYPE org_type AS ENUM ('RESTAURANT', 'HOTEL', 'BAKERY', 'GROCERY', 'CHARITY', 'HUMANITARIAN')`,
    );
    await q.query(`CREATE TYPE org_status AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED')`);
    await q.query(`CREATE TYPE claim_approval_mode AS ENUM ('AUTO', 'MANUAL')`);

    // ---------- users ----------
    await q.query(`
      CREATE TABLE users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email         varchar(254) NOT NULL,
        password_hash varchar(100) NOT NULL,
        role          user_role NOT NULL,
        last_login_at timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email))`);

    // ---------- organizations ----------
    await q.query(`
      CREATE TABLE organizations (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
        name                varchar(160) NOT NULL,
        type                org_type NOT NULL,
        phone               varchar(32) NOT NULL,
        address             varchar(300) NOT NULL,
        area                varchar(120) NOT NULL,
        location            geography(Point, 4326) NOT NULL,
        registration_number varchar(80),
        status              org_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
        status_reason       varchar(500),
        trust_score         numeric(3,2) NOT NULL DEFAULT 4.00 CHECK (trust_score BETWEEN 0 AND 5),
        claim_approval_mode claim_approval_mode NOT NULL DEFAULT 'AUTO',
        verified_at         timestamptz,
        verified_by         uuid REFERENCES users(id),
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX organizations_location_gix ON organizations USING GIST (location)`);
    await q.query(`CREATE INDEX organizations_status_idx ON organizations (status)`);

    // ---------- audit_logs (append-only) ----------
    await q.query(`
      CREATE TABLE audit_logs (
        id            bigserial PRIMARY KEY,
        occurred_at   timestamptz NOT NULL DEFAULT now(),
        actor_user_id uuid,
        actor_role    varchar(16) NOT NULL,
        action        varchar(64) NOT NULL,
        entity_type   varchar(32) NOT NULL,
        entity_id     varchar(64),
        before        jsonb,
        after         jsonb,
        metadata      jsonb,
        ip            varchar(64),
        user_agent    varchar(300),
        request_id    varchar(64)
      )`);
    await q.query(`CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, occurred_at)`);
    await q.query(`CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, occurred_at)`);
    await q.query(`CREATE INDEX audit_logs_action_idx ON audit_logs (action, occurred_at)`);

    await q.query(`
      CREATE FUNCTION audit_logs_block_changes() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only (% is not allowed)', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$`);
    await q.query(`
      CREATE TRIGGER audit_logs_no_update_delete
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION audit_logs_block_changes()`);
    await q.query(`
      CREATE TRIGGER audit_logs_no_truncate
        BEFORE TRUNCATE ON audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_changes()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS audit_logs`);
    await q.query(`DROP FUNCTION IF EXISTS audit_logs_block_changes()`);
    await q.query(`DROP TABLE IF EXISTS organizations`);
    await q.query(`DROP TABLE IF EXISTS users`);
    await q.query(`DROP TYPE IF EXISTS claim_approval_mode`);
    await q.query(`DROP TYPE IF EXISTS org_status`);
    await q.query(`DROP TYPE IF EXISTS org_type`);
    await q.query(`DROP TYPE IF EXISTS user_role`);
  }
}

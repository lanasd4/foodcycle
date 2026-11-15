import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4: notifications.
 *
 * Every notification is a row (so people who were offline see it later), and
 * the insert trigger calls pg_notify. Postgres delivers NOTIFY messages only
 * when the transaction commits and drops them on rollback, so a real-time push
 * can never announce something that did not happen.
 */
export class Notifications1731900000000 implements MigrationInterface {
  name = 'Notifications1731900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE notifications (
        id                bigserial PRIMARY KEY,
        recipient_org_id  uuid REFERENCES organizations(id) ON DELETE CASCADE,
        recipient_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        type              varchar(48) NOT NULL,
        title             varchar(160) NOT NULL,
        body              varchar(500) NOT NULL,
        data              jsonb NOT NULL DEFAULT '{}',
        read_at           timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        CHECK (num_nonnulls(recipient_org_id, recipient_user_id) = 1)
      )`);
    await q.query(`CREATE INDEX notifications_org_idx ON notifications (recipient_org_id, id DESC)`);
    await q.query(`CREATE INDEX notifications_user_idx ON notifications (recipient_user_id, id DESC)`);
    await q.query(`
      CREATE INDEX notifications_unread_org_idx ON notifications (recipient_org_id) WHERE read_at IS NULL`);
    await q.query(`
      CREATE INDEX notifications_unread_user_idx ON notifications (recipient_user_id) WHERE read_at IS NULL`);

    await q.query(`
      CREATE FUNCTION notifications_push() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_notify('fc_notifications', NEW.id::text);
        RETURN NULL;
      END;
      $$`);
    await q.query(`
      CREATE TRIGGER notifications_after_insert
        AFTER INSERT ON notifications
        FOR EACH ROW EXECUTE FUNCTION notifications_push()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS notifications`);
    await q.query(`DROP FUNCTION IF EXISTS notifications_push()`);
  }
}

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { bootFreshApp, charityPayload, createAdmin, donorPayload } from './helpers.js';

/**
 * Phase 1: registration, login, RBAC, admin verification, audit log.
 * Needs the docker-compose database (see README).
 */
describe('Phase 1 — identity, verification, audit (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let donorToken: string;
  let donorOrgId: string;
  let charityToken: string;

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    http = request(app.getHttpServer());
    const admin = await createAdmin(db);
    const res = await http.post('/api/auth/login').send(admin).expect(200);
    adminToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('health check works without a token', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body.db).toBe('up');
  });

  it('registers a donor with a pending organization', async () => {
    const res = await http.post('/api/auth/register').send(donorPayload('Owner@Yasmin.sy')).expect(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'owner@yasmin.sy', role: 'DONOR' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.organization).toMatchObject({
      status: 'PENDING_VERIFICATION',
      claimApprovalMode: 'AUTO',
      location: { lat: 33.5032, lng: 36.2496 },
      trustScore: 4,
    });
    donorToken = res.body.accessToken;
    donorOrgId = res.body.organization.id;
  });

  it('registers a charity', async () => {
    const res = await http.post('/api/auth/register').send(charityPayload('info@basma.org')).expect(201);
    charityToken = res.body.accessToken;
  });

  it('rejects a duplicate email (any case) and leaves no extra audit entry', async () => {
    const before = await db.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'auth.register'`);
    const res = await http.post('/api/auth/register').send(donorPayload('OWNER@yasmin.SY')).expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
    const after = await db.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'auth.register'`);
    expect(after[0].n).toBe(before[0].n);
  });

  it('validates input (org type must match role, no ADMIN self-registration)', async () => {
    await http
      .post('/api/auth/register')
      .send({ ...charityPayload('x@y.org'), role: 'DONOR' })
      .expect(400);
    await http
      .post('/api/auth/register')
      .send({ ...donorPayload('z@y.org'), role: 'ADMIN' })
      .expect(400);
  });

  it('login: wrong password is 401 and audited, right password works', async () => {
    const bad = await http
      .post('/api/auth/login')
      .send({ email: 'owner@yasmin.sy', password: 'wrong-password' })
      .expect(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    await http.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever-123' }).expect(401);

    const failed = await db.query(
      `SELECT actor_role, metadata FROM audit_logs WHERE action = 'auth.login.failed' ORDER BY id`,
    );
    expect(failed).toHaveLength(2);
    expect(failed[0].actor_role).toBe('ANONYMOUS');
    expect(failed[0].metadata.reason).toBe('BAD_PASSWORD');
    expect(failed[1].metadata.reason).toBe('UNKNOWN_EMAIL');

    await http
      .post('/api/auth/login')
      .send({ email: 'OWNER@yasmin.sy', password: 'donor-password-123' })
      .expect(200);
  });

  it('requires a valid token', async () => {
    await http.get('/api/auth/me').expect(401);
    await http.get('/api/auth/me').set(auth('not-a-token')).expect(401);
    const me = await http.get('/api/auth/me').set(auth(donorToken)).expect(200);
    expect(me.body.organization.id).toBe(donorOrgId);
  });

  it('enforces roles', async () => {
    await http.get('/api/organizations').set(auth(donorToken)).expect(403);
    await http.get('/api/admin/audit-logs').set(auth(charityToken)).expect(403);
    await http
      .patch('/api/organizations/me/settings')
      .set(auth(charityToken))
      .send({ claimApprovalMode: 'MANUAL' })
      .expect(403);
  });

  it('donor switches claim approval mode; the change is audited once', async () => {
    const res = await http
      .patch('/api/organizations/me/settings')
      .set(auth(donorToken))
      .send({ claimApprovalMode: 'MANUAL' })
      .expect(200);
    expect(res.body.claimApprovalMode).toBe('MANUAL');

    // same value again: no new audit entry
    await http
      .patch('/api/organizations/me/settings')
      .set(auth(donorToken))
      .send({ claimApprovalMode: 'MANUAL' })
      .expect(200);

    const rows = await db.query(
      `SELECT before, after, actor_role FROM audit_logs WHERE action = 'org.settings.updated' AND entity_id = $1`,
      [donorOrgId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      before: { claimApprovalMode: 'AUTO' },
      after: { claimApprovalMode: 'MANUAL' },
      actor_role: 'DONOR',
    });
  });

  it('admin lists pending organizations and verifies the donor', async () => {
    const list = await http
      .get('/api/organizations?status=PENDING_VERIFICATION')
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.total).toBe(2);

    const res = await http
      .patch(`/api/organizations/${donorOrgId}/verify`)
      .set(auth(adminToken))
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.verifiedAt).toBeTruthy();

    await http
      .patch(`/api/organizations/${donorOrgId}/verify`)
      .set(auth(adminToken))
      .send({ status: 'ACTIVE' })
      .expect(409);
  });

  it('suspending needs a reason and takes effect immediately', async () => {
    await http
      .patch(`/api/organizations/${donorOrgId}/verify`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED' })
      .expect(400);
    await http
      .patch(`/api/organizations/${donorOrgId}/verify`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED', reason: 'وثائق غير مطابقة' })
      .expect(200);

    // same token as before the suspension, the new status is visible right away
    const me = await http.get('/api/organizations/me').set(auth(donorToken)).expect(200);
    expect(me.body.status).toBe('SUSPENDED');

    const actions = await db.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'organization' AND entity_id = $1 ORDER BY id`,
      [donorOrgId],
    );
    expect(actions.map((r: { action: string }) => r.action)).toEqual([
      'org.settings.updated',
      'org.verified',
      'org.suspended',
    ]);
  });

  it('audit log is append-only at the database level', async () => {
    await expect(db.query(`UPDATE audit_logs SET action = 'tampered'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
    await expect(db.query(`TRUNCATE audit_logs`)).rejects.toThrow(/append-only/);
  });

  it('never stores passwords or tokens in the audit log', async () => {
    const rows = await db.query(`SELECT before::text || after::text || metadata::text AS t FROM audit_logs`);
    const all = rows.map((r: { t: string | null }) => r.t ?? '').join(' ');
    expect(all).not.toMatch(/password-123/);
    expect(all).not.toMatch(/\$2[aby]\$/); // bcrypt hash prefix
  });

  it('admin reads the audit log with filters and cursor pagination', async () => {
    const page1 = await http.get('/api/admin/audit-logs?limit=3').set(auth(adminToken)).expect(200);
    expect(page1.body.items).toHaveLength(3);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await http
      .get(`/api/admin/audit-logs?limit=3&cursor=${page1.body.nextCursor}`)
      .set(auth(adminToken))
      .expect(200);
    expect(Number(page2.body.items[0].id)).toBeLessThan(Number(page1.body.items[2].id));

    const filtered = await http
      .get(`/api/admin/audit-logs?entityType=organization&entityId=${donorOrgId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(filtered.body.items).toHaveLength(3);
    expect(filtered.body.items[0].requestId).toBeTruthy();
  });
});

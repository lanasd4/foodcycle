import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AUDIT_ACTIONS } from '../src/audit/audit.actions.js';
import { bootFreshApp, createAdmin, donorPayload } from './helpers.js';

/**
 * Cross-cutting guarantees from the technical plan (section 11) that the
 * phase suites do not cover on their own.
 */
describe('Quality guarantees (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let donor: string;
  let orgId: string;

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    http = request(app.getHttpServer());
    const admin = (await http.post('/api/auth/login').send(await createAdmin(db)).expect(200)).body.accessToken;
    const d = await http.post('/api/auth/register').send(donorPayload('owner@yasmin.sy')).expect(201);
    donor = d.body.accessToken;
    orgId = d.body.organization.id;
    await http
      .patch(`/api/organizations/${orgId}/verify`)
      .set({ Authorization: `Bearer ${admin}` })
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('if the audit entry cannot be written, the change itself is rolled back', async () => {
    // Make every insert of this one action fail at the database level
    await db.query(
      `ALTER TABLE audit_logs ADD CONSTRAINT test_block_settings CHECK (action <> 'org.settings.updated') NOT VALID`,
    );
    try {
      await http
        .patch('/api/organizations/me/settings')
        .set({ Authorization: `Bearer ${donor}` })
        .send({ claimApprovalMode: 'MANUAL' })
        .expect(500);
      const [org] = await db.query(`SELECT claim_approval_mode FROM organizations WHERE id = $1`, [orgId]);
      expect(org.claim_approval_mode).toBe('AUTO'); // unchanged
    } finally {
      await db.query(`ALTER TABLE audit_logs DROP CONSTRAINT test_block_settings`);
    }
    // and works again once the audit log accepts writes
    await http
      .patch('/api/organizations/me/settings')
      .set({ Authorization: `Bearer ${donor}` })
      .send({ claimApprovalMode: 'MANUAL' })
      .expect(200);
  });

  it('a 500 never leaks internals to the client', async () => {
    await db.query(
      `ALTER TABLE audit_logs ADD CONSTRAINT test_block_settings CHECK (action <> 'org.settings.updated') NOT VALID`,
    );
    try {
      const res = await http
        .patch('/api/organizations/me/settings')
        .set({ Authorization: `Bearer ${donor}` })
        .send({ claimApprovalMode: 'AUTO' })
        .expect(500);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/test_block_settings|audit_logs|constraint|stack/i);
    } finally {
      await db.query(`ALTER TABLE audit_logs DROP CONSTRAINT test_block_settings`);
    }
  });

  it('every audit action in the catalogue is emitted somewhere in the code', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const root = join(import.meta.dirname, '../src');
    const files: string[] = [];
    async function walk(dir: string) {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('audit.actions.ts')) files.push(p);
      }
    }
    await walk(root);
    const source = (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n');
    const unused = AUDIT_ACTIONS.filter((a) => !source.includes(`'${a}'`));
    expect(unused).toEqual([]);
  });

  it('security headers: the API does not advertise its framework', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

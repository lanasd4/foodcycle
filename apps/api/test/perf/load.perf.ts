import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { bootFreshApp } from '../helpers.js';

/**
 * Load test (technical plan, section 11): realistic volume, concurrent requests,
 * p95 latency must stay under 300 ms for every endpoint used on a phone.
 *
 *   npm run test:perf -w @foodcycle/api
 *
 * Dataset: 100 donors, 300 charities with needs, 1,000 live offers spread
 * over ~25 x 20 km around Damascus, plus history for the dashboard.
 */
const DONORS = 100;
const CHARITIES = 300;
const OFFERS = 1000;
const PICKUPS = 3000;
const P95_BUDGET_MS = 300;

interface Result {
  name: string;
  n: number;
  p50: number;
  p95: number;
  max: number;
}

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Fire `total` requests with `concurrency` in flight, return latencies (ms). */
async function measure(total: number, concurrency: number, run: (i: number) => Promise<unknown>) {
  const times: number[] = [];
  let next = 0;
  async function worker() {
    while (next < total) {
      const i = next++;
      const t = performance.now();
      await run(i);
      times.push(performance.now() - t);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return times.sort((a, b) => a - b);
}

describe('Load', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  const tokens: { donor: string[]; charity: string[]; admin: string } = { donor: [], charity: [], admin: '' };
  let offerIds: string[] = [];
  const results: Result[] = [];

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    await app.listen(0);
    http = request(app.getHttpServer());

    // ---------- dataset (plain SQL: fast and deterministic enough)
    const loc = `ST_SetSRID(ST_MakePoint(36.2765 + (random() - 0.5) * 0.27, 33.5138 + (random() - 0.5) * 0.18), 4326)::geography`;
    await db.query(`INSERT INTO users (email, password_hash, role) VALUES ('admin@perf', 'x', 'ADMIN')`);
    await db.query(
      `INSERT INTO users (email, password_hash, role)
       SELECT 'donor' || g || '@perf', 'x', 'DONOR' FROM generate_series(1, $1) g`,
      [DONORS],
    );
    await db.query(
      `INSERT INTO users (email, password_hash, role)
       SELECT 'charity' || g || '@perf', 'x', 'CHARITY' FROM generate_series(1, $1) g`,
      [CHARITIES],
    );
    await db.query(`
      INSERT INTO organizations (user_id, name, type, phone, address, area, location, status)
      SELECT u.id, 'جهة ' || u.email, CASE u.role WHEN 'DONOR' THEN 'RESTAURANT'::org_type ELSE 'CHARITY'::org_type END,
             '+963 11 000 0000', 'عنوان', 'منطقة ' || (abs(hashtext(u.email)) % 12), ${loc}, 'ACTIVE'
        FROM users u WHERE u.role <> 'ADMIN'`);
    await db.query(`
      INSERT INTO charity_needs (charity_id, accepted_categories, preferred_categories, daily_capacity_kg, pickup_start, pickup_end)
      SELECT o.id,
             (SELECT array_agg(id) FROM food_categories),
             ARRAY[(1 + abs(hashtext(o.id::text)) % 9)::smallint],
             20 + abs(hashtext(o.name)) % 80,
             CASE WHEN h.limited THEN '06:00'::time END,
             CASE WHEN h.limited THEN '23:30'::time END
        FROM organizations o
        CROSS JOIN LATERAL (SELECT random() < 0.5 AS limited, o.id AS _) h
       WHERE o.type = 'CHARITY'`);

    await db.query(
      `
      INSERT INTO offers (donor_id, category_id, title, allergens, allergens_declared, storage_condition,
                          quantity_kg, remaining_kg, prepared_at, ready_at, pickup_by, effective_deadline,
                          location, pickup_address, area)
      SELECT d.id, c.id, 'عرض ' || g, '{}', true,
             CASE WHEN c.needs_cold_chain THEN 'REFRIGERATED'::storage_condition ELSE 'ROOM_TEMP'::storage_condition END,
             q, q, now() - interval '20 minutes', now(), p, LEAST(p, now() - interval '20 minutes' + c.safe_hours * interval '1 hour'),
             d.location, d.address, d.area
        FROM generate_series(1, $1) g
        CROSS JOIN LATERAL (SELECT (5 + floor(random() * 45))::numeric AS q,
                                   now() + (2 + random() * 8) * interval '1 hour' AS p) x
        CROSS JOIN LATERAL (SELECT * FROM organizations WHERE type = 'RESTAURANT' ORDER BY random() + g * 0 LIMIT 1) d
        CROSS JOIN LATERAL (SELECT * FROM food_categories ORDER BY random() + g * 0 LIMIT 1) c`,
      [OFFERS],
    );

    // history for the dashboard: completed pickups over the last 90 days
    await db.query(
      `
      WITH o AS (
        INSERT INTO offers (donor_id, category_id, title, allergens, allergens_declared, storage_condition,
                            quantity_kg, remaining_kg, prepared_at, ready_at, pickup_by, effective_deadline,
                            location, pickup_address, area, status, created_at)
        SELECT d.id, 4, 'تاريخي', '{}', true, 'ROOM_TEMP', 10, 0, t - interval '1 hour', t - interval '1 hour', t + interval '1 hour', t + interval '1 hour',
               d.location, d.address, d.area, 'COMPLETED', t
          FROM generate_series(1, $1) g
          CROSS JOIN LATERAL (SELECT now() - random() * interval '90 days' AS t) x
          CROSS JOIN LATERAL (SELECT * FROM organizations WHERE type = 'RESTAURANT' ORDER BY random() + g * 0 LIMIT 1) d
        RETURNING id, created_at
      )
      INSERT INTO claims (offer_id, charity_id, quantity_kg, status, approval_mode_applied, picked_up_at, created_at)
      SELECT o.id, ch.id, 10, 'PICKED_UP', 'AUTO', o.created_at + interval '30 minutes', o.created_at
        FROM o CROSS JOIN LATERAL (SELECT id FROM organizations WHERE type = 'CHARITY' ORDER BY random() + extract(epoch FROM o.created_at) * 0 LIMIT 1) ch`,
      [PICKUPS],
    );
    await db.query('ANALYZE');

    const jwt = app.get(JwtService);
    const sign = (id: string, role: string) => jwt.signAsync({ sub: id, role });
    const users: { id: string; role: string }[] = await db.query(`SELECT id, role FROM users`);
    for (const u of users) {
      if (u.role === 'ADMIN') tokens.admin = await sign(u.id, u.role);
      else tokens[u.role === 'DONOR' ? 'donor' : 'charity'].push(await sign(u.id, u.role));
    }
    offerIds = (await db.query(`SELECT id FROM offers WHERE status = 'PUBLISHED'`)).map((r: { id: string }) => r.id);
  }, 300_000);

  afterAll(async () => {
    console.log('\n  endpoint                          n    p50     p95     max   (ms)');
    for (const r of results) {
      console.log(
        `  ${r.name.padEnd(32)} ${String(r.n).padStart(4)} ${r.p50.toFixed(0).padStart(6)} ${r.p95.toFixed(0).padStart(7)} ${r.max.toFixed(0).padStart(7)}`,
      );
    }
    await app?.close();
  });

  async function bench(name: string, total: number, concurrency: number, run: (i: number) => Promise<unknown>) {
    // warm-up: connection pool, query plans
    await run(0);
    const t = await measure(total, concurrency, run);
    const r = { name, n: total, p50: pct(t, 50), p95: pct(t, 95), max: t[t.length - 1] };
    results.push(r);
    return r;
  }

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const charity = (i: number) => tokens.charity[i % tokens.charity.length];
  const donor = (i: number) => tokens.donor[i % tokens.donor.length];

  it('dataset is in place', async () => {
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM offers WHERE status = 'PUBLISHED'`);
    expect(n).toBe(OFFERS);
  });

  it(`browse (Expiry Priority + PostGIS distance) p95 < ${P95_BUDGET_MS} ms`, async () => {
    const r = await bench('GET /offers (browse)', 300, 10, (i) =>
      http.get('/api/offers').query({ maxKm: 10, limit: 20 }).set(auth(charity(i))).expect(200),
    );
    expect(r.p95).toBeLessThan(P95_BUDGET_MS);
  });

  it(`recommended (Smart Matching per charity) p95 < ${P95_BUDGET_MS} ms`, async () => {
    const r = await bench('GET /offers/recommended', 200, 10, (i) =>
      http.get('/api/offers/recommended').set(auth(charity(i))).expect(200),
    );
    expect(r.p95).toBeLessThan(P95_BUDGET_MS);
  });

  it(`matches (Smart Matching per offer) p95 < ${P95_BUDGET_MS} ms`, async () => {
    const owners: { id: string; email: string }[] = await db.query(
      `SELECT o.id, u.email FROM offers o JOIN organizations d ON d.id = o.donor_id JOIN users u ON u.id = d.user_id
        WHERE o.status = 'PUBLISHED' LIMIT 200`,
    );
    const jwt = app.get(JwtService);
    const pairs = await Promise.all(
      owners.map(async (o) => {
        const [u] = await db.query(`SELECT id FROM users WHERE email = $1`, [o.email]);
        return { offerId: o.id, token: await jwt.signAsync({ sub: u.id, role: 'DONOR' }) };
      }),
    );
    const r = await bench('GET /offers/:id/matches', 200, 10, (i) =>
      http.get(`/api/offers/${pairs[i % pairs.length].offerId}/matches`).set(auth(pairs[i % pairs.length].token)).expect(200),
    );
    expect(r.p95).toBeLessThan(P95_BUDGET_MS);
  });

  it(`publish (validation + matching + notifications in one transaction) p95 < ${P95_BUDGET_MS} ms`, async () => {
    const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
    const r = await bench('POST /offers (publish)', 100, 10, (i) =>
      http
        .post('/api/offers')
        .set(auth(donor(i)))
        .send({
          categoryCode: 'BAKERY',
          title: `خبز ${i}`,
          allergens: ['gluten'],
          allergensDeclared: true,
          storageCondition: 'ROOM_TEMP',
          quantityKg: 10,
          preparedAt: iso(-20),
          pickupBy: iso(240),
        })
        .expect(201),
    );
    expect(r.p95).toBeLessThan(P95_BUDGET_MS);
  });

  it(`claim (row lock + quantity check) p95 < ${P95_BUDGET_MS} ms`, async () => {
    // one claim per charity on distinct offers: realistic contention on the charity row only
    const r = await bench('POST /offers/:id/claims', 150, 10, (i) =>
      http
        .post(`/api/offers/${offerIds[(i * 7) % offerIds.length]}/claims`)
        .set(auth(tokens.charity[(i + 1) % tokens.charity.length]))
        .send({ quantityKg: 1 })
        .then((res) => expect([201, 409]).toContain(res.status)),
    );
    expect(r.p95).toBeLessThan(P95_BUDGET_MS);
  });

  it(`impact dashboard (3,000 pickups, 90 days) p95 < ${P95_BUDGET_MS} ms`, async () => {
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const r = await bench('GET /analytics/summary (90 d)', 100, 5, () =>
      http.get('/api/analytics/summary').query({ from }).set(auth(tokens.admin)).expect(200),
    );
    expect(r.p95).toBeLessThan(P95_BUDGET_MS);
    const n = await bench('GET /analytics/need-by-area', 100, 5, () =>
      http.get('/api/analytics/need-by-area').query({ from }).set(auth(tokens.admin)).expect(200),
    );
    expect(n.p95).toBeLessThan(P95_BUDGET_MS);
  });
});

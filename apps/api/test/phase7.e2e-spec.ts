import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { OfferExpiryService } from '../src/offers/offer-expiry.service.js';
import { bootFreshApp, charityPayload, createAdmin, donorPayload } from './helpers.js';

/**
 * Phase 7: Impact Analytics, checked against a scenario computed by hand.
 *
 *   Donors:     D1 مطعم الياسمين,  D2 مخبز السنابل
 *   Charities:  A (المزة, 10 kg/day)   B (كفرسوسة, 20 kg/day)   C (الميدان, no capacity declared)
 *
 *   O1  D1  20 kg  -> A 6 picked up, B 4 picked up, A 3 picked up 40 days ago (previous period)
 *   O2  D2  15 kg  -> B 10 picked up, C 5 picked up
 *   O3  D1   8 kg  -> nobody, expires
 *
 *   Last 30 days: 25 kg saved (6+4+10+5), 4 donations, 2 donors, 3 charities
 *   Previous 30 days: 3 kg, 1 donation
 */
describe('Phase 7 — impact analytics (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let admin: string;
  const t: Record<string, string> = {};

  const auth = (x: string) => ({ Authorization: `Bearer ${x}` });
  const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  async function org(key: string, payload: Record<string, unknown>) {
    const res = await http.post('/api/auth/register').send(payload).expect(201);
    await http.patch(`/api/organizations/${res.body.organization.id}/verify`).set(auth(admin)).send({ status: 'ACTIVE' });
    t[key] = res.body.accessToken;
  }
  const charity = (key: string, area: string, location: { lat: number; lng: number }) =>
    org(key, {
      ...charityPayload(`${key.toLowerCase()}@charity.org`),
      organization: { ...charityPayload('x').organization, name: `جمعية ${key}`, area, location },
    });

  async function publish(donor: string, title: string, kg: number) {
    return (
      await http
        .post('/api/offers')
        .set(auth(t[donor]))
        .send({
          categoryCode: 'BAKERY',
          title,
          allergens: [],
          allergensDeclared: true,
          storageCondition: 'ROOM_TEMP',
          quantityKg: kg,
          preparedAt: iso(-30),
          pickupBy: iso(300),
        })
        .expect(201)
    ).body.id as string;
  }

  async function pickup(charityKey: string, donorKey: string, offerId: string, kg: number) {
    const c = (await http.post(`/api/offers/${offerId}/claims`).set(auth(t[charityKey])).send({ quantityKg: kg }).expect(201))
      .body;
    await http.post('/api/claims/confirm-pickup').set(auth(t[donorKey])).send({ qrToken: c.qrPayload }).expect(200);
    return c.id as string;
  }

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    http = request(app.getHttpServer());
    admin = (await http.post('/api/auth/login').send(await createAdmin(db)).expect(200)).body.accessToken;

    await org('D1', donorPayload('owner@yasmin.sy'));
    await org('D2', {
      ...donorPayload('baker@sanabel.sy'),
      organization: { ...donorPayload('x').organization, name: 'مخبز السنابل', type: 'BAKERY' },
    });
    await charity('A', 'المزة', { lat: 33.5, lng: 36.255 });
    await charity('B', 'كفرسوسة', { lat: 33.4972, lng: 36.2716 });
    await charity('C', 'الميدان', { lat: 33.495, lng: 36.3 });
    // a pending charity must not appear anywhere
    await http.post('/api/auth/register').send(charityPayload('pending@charity.org')).expect(201);

    const needs = (cap: number | null) => ({ acceptedCategories: ['BAKERY'], dailyCapacityKg: cap, pickupHours: null });
    await http.put('/api/charity-needs/me').set(auth(t.A)).send(needs(10)).expect(200);
    await http.put('/api/charity-needs/me').set(auth(t.B)).send(needs(20)).expect(200);

    const o1 = await publish('D1', 'خبز', 20);
    await pickup('A', 'D1', o1, 6);
    await pickup('B', 'D1', o1, 4);
    const old = await pickup('A', 'D1', o1, 3);
    await db.query(`UPDATE claims SET picked_up_at = now() - interval '40 days' WHERE id = $1`, [old]);

    const o2 = await publish('D2', 'معجنات', 15);
    await pickup('B', 'D2', o2, 10);
    await pickup('C', 'D2', o2, 5);

    const o3 = await publish('D1', 'كعك', 8);
    await db.query(`UPDATE offers SET effective_deadline = now() - interval '1 minute' WHERE id = $1`, [o3]);
    await app.get(OfferExpiryService).expireDue();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('summary: totals, losses and change against the previous period', async () => {
    const s = (await http.get('/api/analytics/summary').set(auth(admin)).expect(200)).body;
    expect(s).toMatchObject({
      kgSaved: 25,
      donations: 4,
      activeDonors: 2,
      activeCharities: 3,
      offersPublished: 3,
      kgPublished: 43,
      offersExpired: 1,
      kgExpiredUnclaimed: 8,
      lossRate: 0.186, // 8 / 43
      previous: { kgSaved: 3, donations: 1, activeDonors: 1, activeCharities: 1 },
      change: { kgSaved: 733.3, donations: 300, activeDonors: 100, activeCharities: 200 },
    });
  });

  it('top donors: ranked by kg actually picked up', async () => {
    const { items } = (await http.get('/api/analytics/top-donors').set(auth(admin)).expect(200)).body;
    expect(items).toEqual([
      expect.objectContaining({ rank: 1, name: 'مخبز السنابل', type: 'BAKERY', kgSaved: 15, donations: 2, charitiesServed: 2 }),
      expect.objectContaining({ rank: 2, name: 'مطعم الياسمين', kgSaved: 10, donations: 2, charitiesServed: 2 }),
    ]);
  });

  it('need by area: unmet declared need, most in need first, unknown last', async () => {
    const res = (await http.get('/api/analytics/need-by-area').set(auth(admin)).expect(200)).body;
    expect(res.periodDays).toBe(30);
    expect(res.items.map((x: { area: string }) => x.area)).toEqual(['المزة', 'كفرسوسة', 'الميدان']);
    expect(res.items[0]).toMatchObject({ charities: 1, requestedKg: 300, receivedKg: 6, needIndex: 0.98 }); // 1 - 6/300
    expect(res.items[1]).toMatchObject({ requestedKg: 600, receivedKg: 14, needIndex: 0.977 }); // 1 - 14/600
    expect(res.items[2]).toMatchObject({ requestedKg: null, receivedKg: 5, needIndex: null });
    expect(res.items[0].location.lat).toBeCloseTo(33.5, 3);
  });

  it('trend: one point per day with every day present, adding up to the total', async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const res = (await http.get(`/api/analytics/trend?bucket=day&from=${from}`).set(auth(admin)).expect(200)).body;
    expect(res.timezone).toBe('Asia/Damascus');
    expect(res.points.length).toBeGreaterThanOrEqual(7);
    expect(res.points.length).toBeLessThanOrEqual(8);
    expect(res.points.reduce((a: number, p: { kgSaved: number }) => a + p.kgSaved, 0)).toBe(25);
    const days = res.points.map((p: { start: string }) => new Date(`${p.start}T00:00:00Z`).getTime());
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBe(86_400_000);
  });

  it('a custom period includes the older pickup', async () => {
    const from = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const s = (await http.get(`/api/analytics/summary?from=${from}`).set(auth(admin)).expect(200)).body;
    expect(s.kgSaved).toBe(28);
  });

  it('donors and charities see their own impact', async () => {
    expect((await http.get('/api/analytics/me').set(auth(t.D1)).expect(200)).body).toMatchObject({
      role: 'DONOR',
      kg: 10,
      pickups: 2,
      partners: 2,
    });
    expect((await http.get('/api/analytics/me').set(auth(t.B)).expect(200)).body).toMatchObject({
      role: 'CHARITY',
      kg: 14,
      pickups: 2,
      partners: 2,
    });
  });

  it('admin only for the dashboard; invalid periods are rejected', async () => {
    await http.get('/api/analytics/summary').set(auth(t.D1)).expect(403);
    await http.get('/api/analytics/me').set(auth(admin)).expect(403);
    await http
      .get('/api/analytics/summary?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z')
      .set(auth(admin))
      .expect(400);
  });
});

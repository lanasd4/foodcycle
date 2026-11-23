import type { INestApplication } from '@nestjs/common';
import { CITY_INFO } from '@foodcycle/shared';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { bootFreshApp, charityPayload, createAdmin, donorPayload } from './helpers.js';

/**
 * Multi-city: organizations belong to a city, locations must be inside it,
 * charities only browse their own city, analytics can be filtered by city.
 */
describe('Cities — Damascus and Aleppo (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let admin: string;
  const t: Record<string, string> = {};

  const auth = (x: string) => ({ Authorization: `Bearer ${x}` });
  const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const aleppo = (name: string) => CITY_INFO.ALEPPO.areas.find((a) => a.name === name)!.location;

  const aleppoOrg = (base: ReturnType<typeof donorPayload>, over: Record<string, unknown>) => ({
    ...base,
    organization: { ...base.organization, city: 'ALEPPO', ...over },
  });

  async function org(key: string, payload: Record<string, unknown>) {
    const res = await http.post('/api/auth/register').send(payload).expect(201);
    await http.patch(`/api/organizations/${res.body.organization.id}/verify`).set(auth(admin)).send({ status: 'ACTIVE' });
    t[key] = res.body.accessToken;
    return res.body.organization;
  }

  const bread = (over: Record<string, unknown> = {}) => ({
    categoryCode: 'BAKERY',
    title: 'خبز',
    allergens: [],
    allergensDeclared: true,
    storageCondition: 'ROOM_TEMP',
    quantityKg: 10,
    preparedAt: iso(-30),
    pickupBy: iso(300),
    ...over,
  });

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    http = request(app.getHttpServer());
    admin = (await http.post('/api/auth/login').send(await createAdmin(db)).expect(200)).body.accessToken;

    await org('damDonor', donorPayload('d@dam.sy'));
    await org('damCharity', charityPayload('c@dam.sy'));
    await org(
      'aleDonor',
      aleppoOrg(donorPayload('d@ale.sy'), { name: 'مطعم بيت حلب', area: 'العزيزية', location: aleppo('العزيزية') }),
    );
    await org(
      'aleCharity',
      aleppoOrg(charityPayload('c@ale.sy') as never, { name: 'جمعية حلب الخير', area: 'الجميلية', location: aleppo('الجميلية') }),
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('registration', () => {
    it('defaults to Damascus and returns the city', async () => {
      const res = await http.get('/api/organizations/me').set(auth(t.damDonor)).expect(200);
      expect(res.body.city).toBe('DAMASCUS');
    });

    it('stores Aleppo', async () => {
      const res = await http.get('/api/organizations/me').set(auth(t.aleDonor)).expect(200);
      expect(res.body).toMatchObject({ city: 'ALEPPO', area: 'العزيزية' });
    });

    it('refuses a location outside the chosen city', async () => {
      const res = await http
        .post('/api/auth/register')
        .send(aleppoOrg(donorPayload('wrong@ale.sy'), { location: { lat: 33.5032, lng: 36.2496 } }))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('outside the selected city');
    });

    it('refuses an unknown city', async () => {
      await http
        .post('/api/auth/register')
        .send({ ...donorPayload('x@x.sy'), organization: { ...donorPayload('x').organization, city: 'HOMS' } })
        .expect(400);
    });
  });

  describe('offers', () => {
    it('refuses a pickup point outside the donor city', async () => {
      const res = await http
        .post('/api/offers')
        .set(auth(t.aleDonor))
        .send(bread({ location: { lat: 33.5032, lng: 36.2496 } }))
        .expect(400);
      expect(res.body.code).toBe('LOCATION_OUTSIDE_CITY');
    });

    it('accepts another pickup point in the same city', async () => {
      await http
        .post('/api/offers')
        .set(auth(t.aleDonor))
        .send(bread({ title: 'خبز من الفرع', location: aleppo('السبيل'), area: 'السبيل' }))
        .expect(201);
    });

    it('charities only browse offers of their own city', async () => {
      await http.post('/api/offers').set(auth(t.damDonor)).send(bread({ title: 'خبز دمشقي' })).expect(201);
      await http.post('/api/offers').set(auth(t.aleDonor)).send(bread({ title: 'خبز حلبي' })).expect(201);

      const dam = (await http.get('/api/offers').set(auth(t.damCharity)).expect(200)).body;
      const ale = (await http.get('/api/offers').set(auth(t.aleCharity)).expect(200)).body;
      const titles = (b: { items: { title: string }[] }) => b.items.map((o) => o.title);
      expect(titles(dam)).toContain('خبز دمشقي');
      expect(titles(dam)).not.toContain('خبز حلبي');
      expect(titles(ale)).toContain('خبز حلبي');
      expect(titles(ale)).not.toContain('خبز دمشقي');
      // distances stay within the city
      expect(Math.max(...ale.items.map((o: { distanceKm: number }) => o.distanceKm))).toBeLessThan(10);
    });
  });

  describe('admin', () => {
    it('filters organizations by city', async () => {
      const res = await http.get('/api/organizations?city=ALEPPO').set(auth(admin)).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.every((o: { city: string }) => o.city === 'ALEPPO')).toBe(true);
    });

    it('filters analytics by city', async () => {
      const offer = (await http.post('/api/offers').set(auth(t.aleDonor)).send(bread({ title: 'للاستلام', quantityKg: 7 })).expect(201))
        .body.id;
      const c = (await http.post(`/api/offers/${offer}/claims`).set(auth(t.aleCharity)).send({ quantityKg: 7 }).expect(201)).body;
      await http.post('/api/claims/confirm-pickup').set(auth(t.aleDonor)).send({ qrToken: c.qrPayload }).expect(200);

      const all = (await http.get('/api/analytics/summary').set(auth(admin)).expect(200)).body;
      const ale = (await http.get('/api/analytics/summary?city=ALEPPO').set(auth(admin)).expect(200)).body;
      const dam = (await http.get('/api/analytics/summary?city=DAMASCUS').set(auth(admin)).expect(200)).body;
      expect(ale).toMatchObject({ city: 'ALEPPO', kgSaved: 7, donations: 1 });
      expect(dam).toMatchObject({ city: 'DAMASCUS', kgSaved: 0, donations: 0 });
      expect(all.kgSaved).toBe(7);
      expect(ale.offersPublished + dam.offersPublished).toBe(all.offersPublished);

      const areas = (await http.get('/api/analytics/need-by-area?city=ALEPPO').set(auth(admin)).expect(200)).body;
      expect(areas.items).toEqual([expect.objectContaining({ city: 'ALEPPO', area: 'الجميلية', receivedKg: 7 })]);

      const trend = (await http.get('/api/analytics/trend?city=DAMASCUS').set(auth(admin)).expect(200)).body;
      expect(trend.points.reduce((s: number, p: { kgSaved: number }) => s + p.kgSaved, 0)).toBe(0);
      const trendA = (await http.get('/api/analytics/trend?city=ALEPPO').set(auth(admin)).expect(200)).body;
      expect(trendA.points.reduce((s: number, p: { kgSaved: number }) => s + p.kgSaved, 0)).toBe(7);

      const top = (await http.get('/api/analytics/top-donors?city=DAMASCUS').set(auth(admin)).expect(200)).body;
      expect(top.items).toEqual([]);
    });
  });
});

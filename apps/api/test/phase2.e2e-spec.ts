import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { OfferExpiryService } from '../src/offers/offer-expiry.service.js';
import { bootFreshApp, charityPayload, createAdmin, donorPayload } from './helpers.js';

/**
 * Phase 2: offers, food details, Expiry Priority, expiry job.
 */
describe('Phase 2 — offers and expiry priority (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let admin: string;
  let donor: string;
  let donor2: string;
  let charity: string;
  let farCharity: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const iso = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();

  /** A valid cooked-food offer: prepared 30 min ago, pickup in 2h */
  const cooked = (over: Record<string, unknown> = {}) => ({
    categoryCode: 'COOKED',
    title: 'أرز بالدجاج',
    ingredients: 'أرز، دجاج، زبدة',
    allergens: ['dairy'],
    allergensDeclared: true,
    storageCondition: 'HOT',
    quantityKg: 18,
    preparedAt: iso(-30),
    pickupBy: iso(120),
    ...over,
  });

  async function registerAndActivate(payload: Record<string, unknown>) {
    const res = await http.post('/api/auth/register').send(payload).expect(201);
    await http
      .patch(`/api/organizations/${res.body.organization.id}/verify`)
      .set(auth(admin))
      .send({ status: 'ACTIVE' })
      .expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    http = request(app.getHttpServer());
    const a = await createAdmin(db);
    admin = (await http.post('/api/auth/login').send(a).expect(200)).body.accessToken;

    donor = await registerAndActivate(donorPayload('owner@yasmin.sy'));
    donor2 = await registerAndActivate({
      ...donorPayload('baker@sanabel.sy'),
      organization: { ...donorPayload('x').organization, name: 'مخبز السنابل', type: 'BAKERY' },
    });
    charity = await registerAndActivate(charityPayload('info@basma.org'));
    // ~45 km away from the donors
    farCharity = await registerAndActivate({
      ...charityPayload('far@charity.org'),
      organization: { ...charityPayload('x').organization, name: 'جمعية بعيدة', location: { lat: 33.9, lng: 36.3 } },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists food categories with their safety rules', async () => {
    const res = await http.get('/api/food-categories').set(auth(charity)).expect(200);
    expect(res.body[0]).toMatchObject({ code: 'COOKED', safeHours: 4, needsColdChain: true });
    expect(res.body.map((c: { code: string }) => c.code)).toContain('BAKERY');
  });

  describe('publishing', () => {
    it('donor publishes an offer; deadline, urgency and defaults are computed', async () => {
      const res = await http.post('/api/offers').set(auth(donor)).send(cooked()).expect(201);
      const o = res.body;
      expect(o).toMatchObject({
        status: 'PUBLISHED',
        quantityKg: 18,
        remainingKg: 18,
        allergens: ['dairy'],
        storageCondition: 'HOT',
        area: 'المزة', // from the organization
        donorName: 'مطعم الياسمين',
        category: { code: 'COOKED' },
      });
      // pickup (+2h) is earlier than prepared + 4h safe (+3h30)
      expect(new Date(o.effectiveDeadline).getTime()).toBe(new Date(o.pickupBy).getTime());
      expect(o.remainingMinutes).toBeGreaterThanOrEqual(118);
      expect(o.urgency).toBe('SOON');
    });

    it('caps the deadline by the category safe time', async () => {
      // prepared 3h ago + 4h safe = 1h left, although pickup is in 5h
      const res = await http
        .post('/api/offers')
        .set(auth(donor))
        .send(cooked({ preparedAt: iso(-180), pickupBy: iso(300) }))
        .expect(201);
      expect(res.body.remainingMinutes).toBeLessThanOrEqual(60);
      expect(res.body.urgency).toBe('CRITICAL');
    });

    it('derives kg from portions when only portions are given', async () => {
      const res = await http
        .post('/api/offers')
        .set(auth(donor))
        .send(cooked({ quantityKg: undefined, portions: 30 }))
        .expect(201);
      expect(res.body.quantityKg).toBe(12); // 30 × 0.4 kg
    });

    it('rejects food safety violations with every reason listed', async () => {
      const res = await http
        .post('/api/offers')
        .set(auth(donor))
        .send(cooked({ allergensDeclared: false, storageCondition: 'ROOM_TEMP' }))
        .expect(422);
      expect(res.body.code).toBe('OFFER_RULES_VIOLATED');
      expect(res.body.violations).toEqual(['ALLERGENS_NOT_DECLARED', 'STORAGE_NEEDS_TEMPERATURE_CONTROL']);
    });

    it('refuses an offer without enough time left for transport', async () => {
      const res = await http
        .post('/api/offers')
        .set(auth(donor))
        .send(cooked({ preparedAt: iso(-225) })) // 15 min of safe time left
        .expect(422);
      expect(res.body.violations).toEqual(['TOO_CLOSE_TO_EXPIRY']);
    });

    it('validates shape: unknown allergen, missing quantity, unknown category', async () => {
      await http.post('/api/offers').set(auth(donor)).send(cooked({ allergens: ['lactose'] })).expect(400);
      await http.post('/api/offers').set(auth(donor)).send(cooked({ quantityKg: undefined })).expect(400);
      const r = await http.post('/api/offers').set(auth(donor)).send(cooked({ categoryCode: 'PIZZA' })).expect(400);
      expect(r.body.code).toBe('UNKNOWN_CATEGORY');
    });

    it('only verified donors can publish', async () => {
      const pending = (await http.post('/api/auth/register').send(donorPayload('new@donor.sy')).expect(201)).body
        .accessToken;
      const r = await http.post('/api/offers').set(auth(pending)).send(cooked()).expect(403);
      expect(r.body.code).toBe('ORG_NOT_VERIFIED');
      await http.post('/api/offers').set(auth(charity)).send(cooked()).expect(403);
    });

    it('audits the creation', async () => {
      const rows = await db.query(`SELECT after FROM audit_logs WHERE action = 'offer.created' ORDER BY id LIMIT 1`);
      expect(rows[0].after).toMatchObject({ title: 'أرز بالدجاج', category: 'COOKED', quantityKg: 18 });
    });
  });

  describe('editing and cancelling', () => {
    let id: string;

    beforeAll(async () => {
      id = (await http.post('/api/offers').set(auth(donor)).send(cooked({ title: 'للتعديل' })).expect(201)).body.id;
    });

    it('donor edits an unclaimed offer; the change is audited as a diff', async () => {
      const res = await http
        .patch(`/api/offers/${id}`)
        .set(auth(donor))
        .send({ quantityKg: 10, allergens: ['dairy', 'gluten'] })
        .expect(200);
      expect(res.body).toMatchObject({ quantityKg: 10, remainingKg: 10, allergens: ['dairy', 'gluten'] });

      const [row] = await db.query(
        `SELECT before, after FROM audit_logs WHERE action = 'offer.updated' AND entity_id = $1`,
        [id],
      );
      expect(row.before).toMatchObject({ quantityKg: 18, allergens: ['dairy'] });
      expect(row.after).toMatchObject({ quantityKg: 10, allergens: ['dairy', 'gluten'] });
      expect(row.after.title).toBeUndefined(); // unchanged fields are not stored
    });

    it('edits are re-checked against the safety rules', async () => {
      const r = await http.patch(`/api/offers/${id}`).set(auth(donor)).send({ storageCondition: 'ROOM_TEMP' }).expect(422);
      expect(r.body.violations).toContain('STORAGE_NEEDS_TEMPERATURE_CONTROL');
    });

    it("another donor cannot see or touch the offer (404, not 403)", async () => {
      await http.patch(`/api/offers/${id}`).set(auth(donor2)).send({ title: 'hack' }).expect(404);
      await http.patch(`/api/offers/${id}/cancel`).set(auth(donor2)).send({}).expect(404);
    });

    it('donor cancels; a cancelled offer cannot be edited or cancelled again', async () => {
      const res = await http
        .patch(`/api/offers/${id}/cancel`)
        .set(auth(donor))
        .send({ reason: 'تم توزيعه داخلياً' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'تم توزيعه داخلياً' });
      await http.patch(`/api/offers/${id}`).set(auth(donor)).send({ title: 'x1' }).expect(409);
      await http.patch(`/api/offers/${id}/cancel`).set(auth(donor)).send({}).expect(409);
    });

    it('charities cannot see cancelled offers', async () => {
      await http.get(`/api/offers/${id}`).set(auth(charity)).expect(404);
      await http.get(`/api/offers/${id}`).set(auth(donor)).expect(200);
    });

    it('donor lists own offers with a status filter', async () => {
      const all = await http.get('/api/offers/mine').set(auth(donor)).expect(200);
      expect(all.body.items.every((o: { donorId: string }) => o.donorId === all.body.items[0].donorId)).toBe(true);
      const cancelled = await http.get('/api/offers/mine?status=CANCELLED').set(auth(donor)).expect(200);
      expect(cancelled.body.total).toBe(1);
    });
  });

  describe('Expiry Priority browse (charity)', () => {
    beforeAll(async () => {
      // a bakery offer far from expiry, with gluten and sesame
      await http
        .post('/api/offers')
        .set(auth(donor2))
        .send({
          categoryCode: 'BAKERY',
          title: 'خبز ومعجنات',
          allergens: ['gluten', 'sesame'],
          allergensDeclared: true,
          storageCondition: 'ROOM_TEMP',
          quantityKg: 25,
          preparedAt: iso(-60),
          pickupBy: iso(600),
        })
        .expect(201);
    });

    it('returns published offers, most urgent first, with distance', async () => {
      const res = await http.get('/api/offers').set(auth(charity)).expect(200);
      const items = res.body.items;
      expect(items.length).toBeGreaterThanOrEqual(3);
      const deadlines = items.map((o: { effectiveDeadline: string }) => new Date(o.effectiveDeadline).getTime());
      expect(deadlines).toEqual([...deadlines].sort((a, b) => a - b));
      expect(items[0].urgency).toBe('CRITICAL');
      expect(items[0].distanceKm).toBeGreaterThan(1);
      expect(items[0].distanceKm).toBeLessThan(5);
      expect(items.some((o: { status: string }) => o.status !== 'PUBLISHED')).toBe(false);
    });

    it('filters by category, allergens, minimum quantity and distance', async () => {
      const bakery = await http.get('/api/offers?category=BAKERY').set(auth(charity)).expect(200);
      expect(bakery.body.items.map((o: { title: string }) => o.title)).toEqual(['خبز ومعجنات']);

      const noGluten = await http.get('/api/offers?excludeAllergens=gluten,sesame').set(auth(charity)).expect(200);
      expect(noGluten.body.items.some((o: { allergens: string[] }) => o.allergens.includes('gluten'))).toBe(false);

      const big = await http.get('/api/offers?minKg=20').set(auth(charity)).expect(200);
      expect(big.body.items.every((o: { remainingKg: number }) => o.remainingKg >= 20)).toBe(true);

      const near = await http.get('/api/offers?maxKm=10').set(auth(farCharity)).expect(200);
      expect(near.body.total).toBe(0);
      const wide = await http.get('/api/offers?maxKm=60').set(auth(farCharity)).expect(200);
      expect(wide.body.total).toBeGreaterThan(0);
    });

    it('hides offers without enough transport time, even before the expiry job runs', async () => {
      // Force an offer close to its deadline directly in the DB (the API would refuse to create it)
      const [{ id }] = await db.query(`SELECT id FROM offers WHERE status = 'PUBLISHED' ORDER BY created_at LIMIT 1`);
      await db.query(`UPDATE offers SET effective_deadline = now() + interval '10 minutes' WHERE id = $1`, [id]);

      const res = await http.get('/api/offers').set(auth(charity)).expect(200);
      expect(res.body.items.some((o: { id: string }) => o.id === id)).toBe(false);
      // still PUBLISHED in the database: the query itself filtered it
      const [row] = await db.query(`SELECT status FROM offers WHERE id = $1`, [id]);
      expect(row.status).toBe('PUBLISHED');
    });

    it('only verified charities can browse; donors use /offers/mine', async () => {
      await http.get('/api/offers').set(auth(donor)).expect(403);
      const pending = (await http.post('/api/auth/register').send(charityPayload('pending@ch.org')).expect(201)).body
        .accessToken;
      await http.get('/api/offers').set(auth(pending)).expect(403);
    });
  });

  describe('expiry job', () => {
    it('expires due offers once, audited as SYSTEM, and is safe to run twice', async () => {
      await db.query(`UPDATE offers SET effective_deadline = now() - interval '1 minute' WHERE title = 'خبز ومعجنات'`);
      const expiry = app.get(OfferExpiryService);

      const [first, second] = await Promise.all([expiry.expireDue(), expiry.expireDue()]);
      // the offer pushed to 10 minutes in the previous test + the bakery offer
      expect(first + second).toBe(2);
      expect(await expiry.expireDue()).toBe(0);

      const logs = await db.query(
        `SELECT actor_role, actor_user_id FROM audit_logs WHERE action = 'offer.expired'`,
      );
      expect(logs).toHaveLength(2);
      expect(logs.every((l: { actor_role: string; actor_user_id: string | null }) => l.actor_role === 'SYSTEM' && l.actor_user_id === null)).toBe(true);

      const [row] = await db.query(`SELECT status FROM offers WHERE title = 'خبز ومعجنات'`);
      expect(row.status).toBe('EXPIRED');
    });
  });
});

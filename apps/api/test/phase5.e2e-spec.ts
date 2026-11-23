import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { OfferExpiryService } from '../src/offers/offer-expiry.service.js';
import { bootFreshApp, charityPayload, createAdmin, donorPayload } from './helpers.js';

/**
 * Phase 5: charity needs, Smart Matching, suggestion outcomes, ratings, trust, admin settings.
 *
 * Donor in Mezzeh (33.5032, 36.2496). Charities:
 *   A  ~2.4 km  accepts BAKERY+COOKED, prefers BAKERY, 20 kg/day
 *   B  ~2.4 km  accepts COOKED only                      -> no match for bread
 *   C  ~7 km    accepts BAKERY                           -> match, lower score
 *   D  ~2.4 km  no needs declared (accepts everything)   -> match
 *   E  ~2.4 km  pickup hours that never fit              -> no match
 *   F  ~45 km   accepts BAKERY                           -> out of range
 */
describe('Phase 5 — smart matching, ratings, settings (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let admin: string;
  let donor: string;
  const ch: Record<string, { token: string; orgId: string }> = {};

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const near = { lat: 33.4972, lng: 36.2716 };

  /** HH:MM in Damascus, `hoursAhead` from now */
  const damascusHHMM = (hoursAhead: number) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Damascus', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(Date.now() + hoursAhead * 3_600_000));

  async function charity(key: string, location: { lat: number; lng: number }, needs: Record<string, unknown> | null) {
    const res = await http
      .post('/api/auth/register')
      .send({
        ...charityPayload(`${key.toLowerCase()}@charity.org`),
        organization: { ...charityPayload('x').organization, name: `جمعية ${key}`, location },
      })
      .expect(201);
    await http
      .patch(`/api/organizations/${res.body.organization.id}/verify`)
      .set(auth(admin))
      .send({ status: 'ACTIVE' })
      .expect(200);
    ch[key] = { token: res.body.accessToken, orgId: res.body.organization.id };
    if (needs) await http.put('/api/charity-needs/me').set(auth(ch[key].token)).send(needs).expect(200);
  }

  const bread = (over: Record<string, unknown> = {}) => ({
    categoryCode: 'BAKERY',
    title: 'خبز',
    allergens: ['gluten'],
    allergensDeclared: true,
    storageCondition: 'ROOM_TEMP',
    quantityKg: 20,
    preparedAt: iso(-30),
    pickupBy: iso(240),
    ...over,
  });
  const publish = async (over: Record<string, unknown> = {}) =>
    (await http.post('/api/offers').set(auth(donor)).send(bread(over)).expect(201)).body.id as string;

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    http = request(app.getHttpServer());
    admin = (await http.post('/api/auth/login').send(await createAdmin(db)).expect(200)).body.accessToken;
    const d = await http.post('/api/auth/register').send(donorPayload('owner@yasmin.sy')).expect(201);
    donor = d.body.accessToken;
    await http.patch(`/api/organizations/${d.body.organization.id}/verify`).set(auth(admin)).send({ status: 'ACTIVE' });

    const all = { pickupHours: null };
    await charity('A', near, { ...all, acceptedCategories: ['BAKERY', 'COOKED'], preferredCategories: ['BAKERY'], dailyCapacityKg: 20 });
    await charity('B', near, { ...all, acceptedCategories: ['COOKED'], dailyCapacityKg: null });
    await charity('C', { lat: 33.55, lng: 36.3 }, { ...all, acceptedCategories: ['BAKERY'], dailyCapacityKg: null });
    await charity('D', near, null);
    await charity('E', near, {
      acceptedCategories: ['BAKERY'],
      dailyCapacityKg: null,
      pickupHours: { start: damascusHHMM(6), end: damascusHHMM(7) },
    });
    await charity('F', { lat: 33.65, lng: 36.45 }, { ...all, acceptedCategories: ['BAKERY'], dailyCapacityKg: null });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('charity needs', () => {
    it('reads back with category codes', async () => {
      const res = await http.get('/api/charity-needs/me').set(auth(ch.A.token)).expect(200);
      expect(res.body).toEqual({
        acceptedCategories: ['COOKED', 'BAKERY'], // in category order
        preferredCategories: ['BAKERY'],
        dailyCapacityKg: 20,
        pickupHours: null,
      });
    });

    it('validates: preferred must be accepted, categories must exist', async () => {
      await http
        .put('/api/charity-needs/me')
        .set(auth(ch.B.token))
        .send({ acceptedCategories: ['COOKED'], preferredCategories: ['BAKERY'], dailyCapacityKg: null, pickupHours: null })
        .expect(400);
      const r = await http
        .put('/api/charity-needs/me')
        .set(auth(ch.B.token))
        .send({ acceptedCategories: ['PIZZA'], dailyCapacityKg: null, pickupHours: null })
        .expect(400);
      expect(r.body.code).toBe('UNKNOWN_CATEGORY');
    });

    it('donors cannot set needs; changes are audited', async () => {
      await http.get('/api/charity-needs/me').set(auth(donor)).expect(403);
      const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'org.needs.updated'`);
      expect(n).toBe(5); // A, B, C, E, F
    });
  });

  describe('matching for an offer (donor view)', () => {
    let offerId: string;
    let items: { charityId: string; name: string; score: number; reasons: string[]; distanceKm: number }[];

    beforeAll(async () => {
      offerId = await publish();
      items = (await http.get(`/api/offers/${offerId}/matches`).set(auth(donor)).expect(200)).body.items;
    });

    it('keeps only charities that pass every mandatory condition', () => {
      expect(items.map((x) => x.name).sort()).toEqual(['جمعية A', 'جمعية C', 'جمعية D']);
    });

    it('ranks by score, best first, with readable reasons', () => {
      const scores = items.map((x) => x.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(items[0].name).toBe('جمعية A'); // near + preferred type + quantity fits
      expect(items[0].reasons).toEqual(
        expect.arrayContaining(['تطلب هذا النوع', 'الكمية تناسب سعتها', `قريبة (${items[0].distanceKm} كم)`]),
      );
      expect(items.find((x) => x.name === 'جمعية C')!.score).toBeLessThan(items[0].score);
    });

    it('alerts exactly the matched charities on publish, and logs the suggestions', async () => {
      const notified: { recipient_org_id: string }[] = await db.query(
        `SELECT recipient_org_id FROM notifications WHERE type = 'offer.new_match' AND data->>'offerId' = $1`,
        [offerId],
      );
      expect(notified.map((r) => r.recipient_org_id).sort()).toEqual([ch.A.orgId, ch.C.orgId, ch.D.orgId].sort());

      const logged = await db.query(
        `SELECT charity_id, source, outcome, weights_version FROM matching_suggestions WHERE offer_id = $1`,
        [offerId],
      );
      expect(logged).toHaveLength(3);
      expect(logged.every((r: { source: string; outcome: string }) => r.source === 'NOTIFIED' && r.outcome === 'PENDING')).toBe(true);
    });

    it('only the offer owner or an admin can see its matches', async () => {
      await http.get(`/api/offers/${offerId}/matches`).set(auth(ch.A.token)).expect(403);
      await http.get(`/api/offers/${offerId}/matches`).set(auth(admin)).expect(200);
    });
  });

  describe('recommendations (charity view)', () => {
    it('charity A sees bread first with its reasons', async () => {
      const res = await http.get('/api/offers/recommended').set(auth(ch.A.token)).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      const first = res.body.items[0];
      expect(first.offer.category.code).toBe('BAKERY');
      expect(first.match.reasons).toContain('من الأصناف التي تطلبونها');
      expect(first.match.score).toBeGreaterThan(0.5);
    });

    it('charity B (cooked food only) gets nothing for bread', async () => {
      const res = await http.get('/api/offers/recommended').set(auth(ch.B.token)).expect(200);
      expect(res.body.items).toHaveLength(0);
    });

    it('is not captured by GET /offers/:id', async () => {
      await http.get('/api/offers/recommended').set(auth(ch.A.token)).expect(200);
    });
  });

  describe('suggestion outcomes and capacity', () => {
    let offer1: string;
    let claimId: string;

    it('a suggested charity that claims is recorded as CLAIMED', async () => {
      offer1 = await publish({ title: 'خبز للحجز' });
      const c = await http.post(`/api/offers/${offer1}/claims`).set(auth(ch.A.token)).send({ quantityKg: 20 }).expect(201);
      claimId = c.body.id;
      const [row] = await db.query(
        `SELECT outcome FROM matching_suggestions WHERE offer_id = $1 AND charity_id = $2`,
        [offer1, ch.A.orgId],
      );
      expect(row.outcome).toBe('CLAIMED');
    });

    it('a charity whose daily capacity is used up is no longer matched', async () => {
      const offer2 = await publish({ title: 'خبز ثانٍ' });
      const res = await http.get(`/api/offers/${offer2}/matches`).set(auth(donor)).expect(200);
      expect(res.body.items.some((x: { name: string }) => x.name === 'جمعية A')).toBe(false);

      // cancelled offer: pending suggestions become IGNORED
      await http.patch(`/api/offers/${offer2}/cancel`).set(auth(donor)).send({}).expect(200);
      const outcomes = await db.query(`SELECT DISTINCT outcome FROM matching_suggestions WHERE offer_id = $1`, [offer2]);
      expect(outcomes).toEqual([{ outcome: 'IGNORED' }]);
    });

    it('an expired offer marks its pending suggestions OFFER_EXPIRED', async () => {
      const offer3 = await publish({ title: 'خبز سينتهي' });
      await db.query(`UPDATE offers SET effective_deadline = now() - interval '1 minute' WHERE id = $1`, [offer3]);
      await app.get(OfferExpiryService).expireDue();
      const outcomes = await db.query(`SELECT DISTINCT outcome FROM matching_suggestions WHERE offer_id = $1`, [offer3]);
      expect(outcomes).toEqual([{ outcome: 'OFFER_EXPIRED' }]);
    });

    describe('ratings and trust', () => {
      beforeAll(async () => {
        const mine = (await http.get(`/api/claims/${claimId}`).set(auth(ch.A.token)).expect(200)).body;
        await http.post('/api/claims/confirm-pickup').set(auth(donor)).send({ qrToken: mine.qrPayload }).expect(200);
      });

      it('cannot rate before pickup or someone else’s claim', async () => {
        const o = await publish({ title: 'خبز آخر' });
        const c = (await http.post(`/api/offers/${o}/claims`).set(auth(ch.C.token)).send({ quantityKg: 2 }).expect(201)).body;
        expect((await http.post(`/api/claims/${c.id}/rating`).set(auth(ch.C.token)).send({ score: 5 }).expect(409)).body.code).toBe(
          'NOT_PICKED_UP',
        );
        await http.post(`/api/claims/${claimId}/rating`).set(auth(ch.C.token)).send({ score: 5 }).expect(404);
      });

      it('each side rates once; the trust score follows the formula', async () => {
        await http
          .post(`/api/claims/${claimId}/rating`)
          .set(auth(ch.A.token))
          .send({ score: 5, comment: 'تعامل ممتاز' })
          .expect(201);
        expect((await http.post(`/api/claims/${claimId}/rating`).set(auth(ch.A.token)).send({ score: 4 }).expect(409)).body.code).toBe(
          'ALREADY_RATED',
        );
        await http.post(`/api/claims/${claimId}/rating`).set(auth(donor)).send({ score: 2 }).expect(201);

        // donor: (4*3 + 5) / 4 = 4.25    charity A: (4*3 + 2) / 4 = 3.5
        const donorSide = (await http.get('/api/ratings/received').set(auth(donor)).expect(200)).body;
        expect(donorSide).toMatchObject({ count: 1, average: 5, trustScore: 4.25 });
        expect(donorSide.items[0]).toMatchObject({ score: 5, comment: 'تعامل ممتاز', fromName: 'جمعية A' });
        const charitySide = (await http.get('/api/ratings/received').set(auth(ch.A.token)).expect(200)).body;
        expect(charitySide.trustScore).toBe(3.5);
      });

      it('claim shows ratedByMe; the rated side is notified; changes are audited', async () => {
        expect((await http.get(`/api/claims/${claimId}`).set(auth(ch.A.token)).expect(200)).body.ratedByMe).toBe(true);
        const [n] = await db.query(
          `SELECT title, body FROM notifications WHERE type = 'rating.received' AND recipient_org_id = $1`,
          [ch.A.orgId],
        );
        expect(n).toEqual({ title: 'وصلكم تقييم جديد', body: 'قيّم مطعم الياسمين عملية «خبز للحجز» بـ 2 من 5.' });
        const audits = await db.query(
          `SELECT count(*)::int AS n FROM audit_logs WHERE action IN ('rating.created', 'trust_score.changed')`,
        );
        expect(audits[0].n).toBe(4);
      });
    });
  });

  describe('admin settings', () => {
    it('only admins can read or change settings', async () => {
      await http.get('/api/admin/settings').set(auth(donor)).expect(403);
      const res = await http.get('/api/admin/settings').set(auth(admin)).expect(200);
      expect(res.body).toMatchObject({ weights_version: 1, service_radius_km: 15, timezone: 'Asia/Damascus' });
    });

    it('rejects weights that do not sum to 1 and inconsistent thresholds', async () => {
      await http
        .patch('/api/admin/settings')
        .set(auth(admin))
        .send({ weights: { dist: 0.5, type: 0.5, qty: 0.5, time: 0, trust: 0 } })
        .expect(400);
      expect(
        (await http.patch('/api/admin/settings').set(auth(admin)).send({ urgency_critical_minutes: 500 }).expect(400)).body.code,
      ).toBe('INVALID_THRESHOLDS');
      await http.patch('/api/admin/settings').set(auth(admin)).send({ timezone: 'Mars/Olympus' }).expect(400);
    });

    it('new weights bump the version, are audited, and change the ranking', async () => {
      const res = await http
        .patch('/api/admin/settings')
        .set(auth(admin))
        .send({ weights: { dist: 1, type: 0, qty: 0, time: 0, trust: 0 } })
        .expect(200);
      expect(res.body.weights_version).toBe(2);
      const [log] = await db.query(`SELECT before, after FROM audit_logs WHERE action = 'settings.weights.updated'`);
      expect(log.before.weightsVersion).toBe(1);
      expect(log.after.weightsVersion).toBe(2);

      // distance only: the nearest charities come first, the 7 km one last
      const o = await publish({ title: 'خبز للترتيب' });
      const m = (await http.get(`/api/offers/${o}/matches`).set(auth(donor)).expect(200)).body;
      expect(m.weightsVersion).toBe(2);
      expect(m.items[m.items.length - 1].name).toBe('جمعية C');
    });

    it('other settings are audited separately and take effect', async () => {
      await http.patch('/api/admin/settings').set(auth(admin)).send({ service_radius_km: 5 }).expect(200);
      const [log] = await db.query(`SELECT before, after FROM audit_logs WHERE action = 'settings.updated'`);
      expect(log).toEqual({ before: { service_radius_km: 15 }, after: { service_radius_km: 5 } });
      const o = await publish({ title: 'خبز بنطاق ضيق' });
      const m = (await http.get(`/api/offers/${o}/matches`).set(auth(donor)).expect(200)).body;
      expect(m.items.some((x: { name: string }) => x.name === 'جمعية C')).toBe(false); // 7 km > 5 km
    });
  });
});

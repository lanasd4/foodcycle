import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { ClaimsService } from '../src/claims/claims.service.js';
import { bootFreshApp, charityPayload, createAdmin, donorPayload } from './helpers.js';

/**
 * Phase 3: claims, approval modes, QR / code pickup, timeouts, concurrency.
 */
describe('Phase 3 — claims, approval, pickup (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let admin: string;
  let donor: string;
  let otherDonor: string;
  const charities: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  async function activate(payload: Record<string, unknown>) {
    const res = await http.post('/api/auth/register').send(payload).expect(201);
    await http
      .patch(`/api/organizations/${res.body.organization.id}/verify`)
      .set(auth(admin))
      .send({ status: 'ACTIVE' })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function publish(token: string, over: Record<string, unknown> = {}) {
    const res = await http
      .post('/api/offers')
      .set(auth(token))
      .send({
        categoryCode: 'BAKERY',
        title: 'خبز',
        allergens: ['gluten'],
        allergensDeclared: true,
        storageCondition: 'ROOM_TEMP',
        quantityKg: 18,
        preparedAt: iso(-30),
        pickupBy: iso(240),
        ...over,
      })
      .expect(201);
    return res.body.id as string;
  }

  const claim = (token: string, offerId: string, kg: number) =>
    http.post(`/api/offers/${offerId}/claims`).set(auth(token)).send({ quantityKg: kg });
  const offerRow = async (id: string) =>
    (await db.query(`SELECT status, remaining_kg::float AS remaining FROM offers WHERE id = $1`, [id]))[0];
  const sweep = () => app.get(ClaimsService).sweepExpired();

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    http = request(app.getHttpServer());
    admin = (await http.post('/api/auth/login').send(await createAdmin(db)).expect(200)).body.accessToken;
    donor = await activate(donorPayload('owner@yasmin.sy'));
    otherDonor = await activate(donorPayload('other@donor.sy'));
    for (let i = 0; i < 10; i++) {
      charities.push(
        await activate({
          ...charityPayload(`c${i}@charity.org`),
          organization: { ...charityPayload('x').organization, name: `جمعية ${i}` },
        }),
      );
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('AUTO mode', () => {
    let offerId: string;
    let claimId: string;
    let qrPayload: string;

    it('a claim is reserved immediately with a QR payload and pickup code', async () => {
      offerId = await publish(donor);
      const res = await claim(charities[0], offerId, 5).expect(201);
      expect(res.body).toMatchObject({ status: 'RESERVED', approvalMode: 'AUTO', quantityKg: 5 });
      expect(res.body.qrPayload).toMatch(/^FC1:/);
      expect(res.body.pickupCode).toMatch(/^\d{6}$/);
      // 45 min reservation
      expect(res.body.reservationSecondsLeft).toBeGreaterThan(44 * 60);
      expect(res.body.reservationSecondsLeft).toBeLessThanOrEqual(45 * 60);
      claimId = res.body.id;
      qrPayload = res.body.qrPayload;
      expect(await offerRow(offerId)).toEqual({ status: 'PUBLISHED', remaining: 13 });
    });

    it('the donor sees the incoming claim but never its secrets', async () => {
      const res = await http.get('/api/claims/incoming').set(auth(donor)).expect(200);
      const c = res.body.items.find((x: { id: string }) => x.id === claimId);
      expect(c.charity.name).toBe('جمعية 0');
      expect(c.qrPayload).toBeUndefined();
      expect(c.pickupCode).toBeUndefined();
    });

    it('other charities and donors cannot see the claim', async () => {
      await http.get(`/api/claims/${claimId}`).set(auth(charities[1])).expect(404);
      await http.get(`/api/claims/${claimId}`).set(auth(otherDonor)).expect(404);
    });

    it('refuses a second active claim on the same offer and more than what is left', async () => {
      expect((await claim(charities[0], offerId, 1).expect(409)).body.code).toBe('ALREADY_CLAIMED');
      const r = await claim(charities[1], offerId, 14).expect(409);
      expect(r.body).toMatchObject({ code: 'INSUFFICIENT_QUANTITY', remainingKg: 13 });
    });

    it('only the donor of the offer can confirm the pickup; the QR is single-use', async () => {
      await http.post('/api/claims/confirm-pickup').set(auth(otherDonor)).send({ qrToken: qrPayload }).expect(404);
      const res = await http
        .post('/api/claims/confirm-pickup')
        .set(auth(donor))
        .send({ qrToken: qrPayload })
        .expect(200);
      expect(res.body.status).toBe('PICKED_UP');
      expect(res.body.pickedUpAt).toBeTruthy();
      await http.post('/api/claims/confirm-pickup').set(auth(donor)).send({ qrToken: qrPayload }).expect(404);

      const [log] = await db.query(`SELECT metadata FROM audit_logs WHERE action = 'claim.picked_up'`);
      expect(log.metadata).toMatchObject({ method: 'QR', quantityKg: 5 });
    });

    it('pickup also works with the 6-digit code when the camera fails', async () => {
      const c = (await claim(charities[1], offerId, 3).expect(201)).body;
      await http
        .post('/api/claims/confirm-pickup')
        .set(auth(donor))
        .send({ offerId, pickupCode: c.pickupCode === '000000' ? '000001' : '000000' })
        .expect(404);
      const res = await http
        .post('/api/claims/confirm-pickup')
        .set(auth(donor))
        .send({ offerId, pickupCode: c.pickupCode })
        .expect(200);
      expect(res.body.status).toBe('PICKED_UP');
    });

    it('a charity cancels its reservation and the quantity goes back', async () => {
      const c = (await claim(charities[2], offerId, 4).expect(201)).body;
      expect((await offerRow(offerId)).remaining).toBe(6);
      const res = await http.delete(`/api/claims/${c.id}`).set(auth(charities[2])).expect(200);
      expect(res.body.status).toBe('CANCELLED_BY_CHARITY');
      expect(res.body.qrPayload).toBeUndefined();
      expect((await offerRow(offerId)).remaining).toBe(10);
      await http.delete(`/api/claims/${c.id}`).set(auth(charities[2])).expect(409);
    });

    it('the offer becomes RESERVED when fully claimed and COMPLETED once everything is picked up', async () => {
      const c = (await claim(charities[3], offerId, 10).expect(201)).body;
      expect(await offerRow(offerId)).toEqual({ status: 'RESERVED', remaining: 0 });
      expect((await claim(charities[4], offerId, 1).expect(409)).body.code).toBe('OFFER_NOT_AVAILABLE');
      await http.post('/api/claims/confirm-pickup').set(auth(donor)).send({ qrToken: c.qrPayload }).expect(200);
      expect((await offerRow(offerId)).status).toBe('COMPLETED');
    });
  });

  describe('concurrency', () => {
    it('10 simultaneous claims of 3 kg on an 18 kg offer: exactly 6 succeed', async () => {
      const offerId = await publish(donor);
      const results = await Promise.all(charities.map((t) => claim(t, offerId, 3)));
      const codes = results.map((r) => r.status).sort();
      expect(codes.filter((s) => s === 201)).toHaveLength(6);
      expect(codes.filter((s) => s === 409)).toHaveLength(4);
      expect(await offerRow(offerId)).toEqual({ status: 'RESERVED', remaining: 0 });
      const [{ sum }] = await db.query(
        `SELECT sum(quantity_kg)::float AS sum FROM claims WHERE offer_id = $1 AND status = 'RESERVED'`,
        [offerId],
      );
      expect(sum).toBe(18);
      // free those charities for the next tests
      for (const r of results.filter((x) => x.status === 201)) {
        const owner = charities[results.indexOf(r)];
        await http.delete(`/api/claims/${r.body.id}`).set(auth(owner)).expect(200);
      }
    });

    it('a charity cannot exceed the active-claims limit, even in parallel', async () => {
      const offers = await Promise.all([1, 2, 3, 4, 5].map(() => publish(donor, { quantityKg: 5 })));
      const results = await Promise.all(offers.map((o) => claim(charities[9], o, 1)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(3); // max_active_claims_per_charity
      expect(results.filter((r) => r.body.code === 'TOO_MANY_ACTIVE_CLAIMS')).toHaveLength(2);
      for (const r of results.filter((x) => x.status === 201)) {
        await http.delete(`/api/claims/${r.body.id}`).set(auth(charities[9])).expect(200);
      }
    });
  });

  describe('MANUAL mode', () => {
    let offerId: string;

    beforeAll(async () => {
      await http
        .patch('/api/organizations/me/settings')
        .set(auth(donor))
        .send({ claimApprovalMode: 'MANUAL' })
        .expect(200);
      offerId = await publish(donor);
    });

    it('a claim waits for approval, holds the quantity and has no QR yet', async () => {
      const res = await claim(charities[0], offerId, 6).expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING_APPROVAL', approvalMode: 'MANUAL' });
      expect(res.body.qrPayload).toBeUndefined();
      expect(res.body.approvalSecondsLeft).toBeGreaterThan(14 * 60);
      expect(res.body.approvalSecondsLeft).toBeLessThanOrEqual(15 * 60);
      expect((await offerRow(offerId)).remaining).toBe(12);
    });

    it('approval starts the pickup countdown from the approval time', async () => {
      const c = (await claim(charities[1], offerId, 2).expect(201)).body;
      // pretend the charity asked 10 minutes ago
      await db.query(`UPDATE claims SET created_at = now() - interval '10 minutes' WHERE id = $1`, [c.id]);
      const res = await http.post(`/api/claims/${c.id}/approve`).set(auth(donor)).expect(200);
      expect(res.body.status).toBe('RESERVED');
      expect(res.body.reservationSecondsLeft).toBeGreaterThan(44 * 60);
      const mine = await http.get(`/api/claims/${c.id}`).set(auth(charities[1])).expect(200);
      expect(mine.body.qrPayload).toMatch(/^FC1:/);
    });

    it('rejection returns the quantity, with no penalty for the charity', async () => {
      const c = (await claim(charities[2], offerId, 4).expect(201)).body;
      const before = (await offerRow(offerId)).remaining;
      const res = await http
        .post(`/api/claims/${c.id}/reject`)
        .set(auth(donor))
        .send({ reason: 'الكمية مخصصة لجهة أخرى' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'الكمية مخصصة لجهة أخرى' });
      expect((await offerRow(offerId)).remaining).toBe(before + 4);
      const [org] = await db.query(
        `SELECT trust_score::float AS t FROM organizations o JOIN users u ON u.id = o.user_id WHERE u.email = 'c2@charity.org'`,
      );
      expect(org.t).toBe(4);
    });

    it('approve and reject at the same moment: exactly one wins', async () => {
      const c = (await claim(charities[3], offerId, 1).expect(201)).body;
      const [a, r] = await Promise.all([
        http.post(`/api/claims/${c.id}/approve`).set(auth(donor)),
        http.post(`/api/claims/${c.id}/reject`).set(auth(donor)).send({}),
      ]);
      expect([a.status, r.status].sort()).toEqual([200, 409]);
    });

    it('another donor cannot approve', async () => {
      const c = (await claim(charities[4], offerId, 1).expect(201)).body;
      await http.post(`/api/claims/${c.id}/approve`).set(auth(otherDonor)).expect(404);
    });

    it('an unanswered request times out, gives the quantity back, no penalty', async () => {
      const c = (await claim(charities[5], offerId, 1).expect(201)).body;
      await db.query(`UPDATE claims SET approval_deadline = now() - interval '1 second' WHERE id = $1`, [c.id]);
      // too late to approve even before the sweep runs
      expect((await http.post(`/api/claims/${c.id}/approve`).set(auth(donor)).expect(409)).body.code).toBe(
        'APPROVAL_WINDOW_CLOSED',
      );
      const before = (await offerRow(offerId)).remaining;
      const out = await sweep();
      expect(out.approvalTimeouts).toBe(1);
      expect((await http.get(`/api/claims/${c.id}`).set(auth(charities[5])).expect(200)).body.status).toBe(
        'APPROVAL_TIMEOUT',
      );
      expect((await offerRow(offerId)).remaining).toBe(before + 1);
    });

    it('the offer override beats the restaurant setting', async () => {
      const autoOffer = await publish(donor, { claimApprovalMode: 'AUTO' });
      expect((await claim(charities[6], autoOffer, 1).expect(201)).body.status).toBe('RESERVED');
    });
  });

  describe('no-show and offer cancellation', () => {
    it('a reservation not picked up expires: quantity back, trust score reduced, all audited', async () => {
      await http.patch('/api/organizations/me/settings').set(auth(otherDonor)).send({ claimApprovalMode: 'AUTO' });
      const offerId = await publish(otherDonor);
      const c = (await claim(charities[7], offerId, 8).expect(201)).body;
      await db.query(`UPDATE claims SET reserved_until = now() - interval '1 second' WHERE id = $1`, [c.id]);

      const [first, second] = await Promise.all([sweep(), sweep()]);
      expect(first.noShows + second.noShows).toBe(1);

      expect((await http.get(`/api/claims/${c.id}`).set(auth(charities[7])).expect(200)).body.status).toBe('EXPIRED');
      expect(await offerRow(offerId)).toEqual({ status: 'PUBLISHED', remaining: 18 });
      const [org] = await db.query(
        `SELECT trust_score::float AS t FROM organizations o JOIN users u ON u.id = o.user_id WHERE u.email = 'c7@charity.org'`,
      );
      expect(org.t).toBe(3.5);
      const logs = await db.query(
        `SELECT action, actor_role FROM audit_logs WHERE action IN ('claim.expired', 'trust_score.changed') ORDER BY id`,
      );
      expect(logs).toEqual([
        { action: 'claim.expired', actor_role: 'SYSTEM' },
        { action: 'trust_score.changed', actor_role: 'SYSTEM' },
      ]);
    });

    it('cancelling an offer cancels its active claims without penalty', async () => {
      const offerId = await publish(otherDonor);
      const c = (await claim(charities[8], offerId, 5).expect(201)).body;
      const res = await http.patch(`/api/offers/${offerId}/cancel`).set(auth(otherDonor)).send({}).expect(200);
      expect(res.body.status).toBe('CANCELLED');
      const after = await http.get(`/api/claims/${c.id}`).set(auth(charities[8])).expect(200);
      expect(after.body.status).toBe('CANCELLED_BY_DONOR');
      expect(after.body.qrPayload).toBeUndefined();
      const [log] = await db.query(`SELECT metadata FROM audit_logs WHERE action = 'offer.cancelled' AND entity_id = $1`, [
        offerId,
      ]);
      expect(log.metadata.claimsCancelled).toBe(1);
    });

    it('a claimed offer can no longer be edited', async () => {
      const offerId = await publish(otherDonor);
      await claim(charities[8], offerId, 1).expect(201);
      expect(
        (await http.patch(`/api/offers/${offerId}`).set(auth(otherDonor)).send({ title: 'جديد' }).expect(409)).body.code,
      ).toBe('OFFER_LOCKED');
    });
  });

  it('the audit log never contains QR tokens or pickup codes', async () => {
    const rows = await db.query(`SELECT coalesce(before::text,'') || coalesce(after::text,'') || coalesce(metadata::text,'') AS t FROM audit_logs`);
    const tokens = await db.query(`SELECT 1 FROM audit_logs WHERE (after ? 'qrToken') OR (after ? 'pickupCode')`);
    expect(tokens).toHaveLength(0);
    expect(rows.map((r: { t: string }) => r.t).join(' ')).not.toMatch(/FC1:/);
  });
});

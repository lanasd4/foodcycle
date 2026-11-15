import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { ClaimsService } from '../src/claims/claims.service.js';
import { bootFreshApp, charityPayload, createAdmin, donorPayload } from './helpers.js';

interface Note {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/** A Socket.IO client that records every notification it receives. */
class Client {
  readonly received: Note[] = [];
  private constructor(readonly socket: Socket) {
    socket.on('notification', (n: Note) => this.received.push(n));
  }

  static async connect(baseUrl: string, token?: string): Promise<Client> {
    const socket = io(`${baseUrl}/events`, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
    const c = new Client(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('ready', () => resolve());
      socket.once('auth_error', (e) => reject(new Error(e.code)));
      setTimeout(() => reject(new Error('connect timeout')), 5000);
    });
    return c;
  }

  async waitFor(type: string, timeoutMs = 3000): Promise<Note> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const n = this.received.find((x) => x.type === type);
      if (n) return n;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`no "${type}" notification within ${timeoutMs} ms (got: ${this.received.map((x) => x.type).join(', ') || 'none'})`);
  }

  close() {
    this.socket.close();
  }
}

const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));

describe('Phase 4 — real-time notifications (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let baseUrl: string;
  let admin: string;
  let donor: string;
  let donorOrgId: string;
  let nearCharity: string;
  let farCharity: string;
  const clients: Client[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const connect = async (token?: string) => {
    const c = await Client.connect(baseUrl, token);
    clients.push(c);
    return c;
  };
  const register = async (payload: Record<string, unknown>) =>
    (await http.post('/api/auth/register').send(payload).expect(201)).body as {
      accessToken: string;
      organization: { id: string };
    };
  const verify = (orgId: string) =>
    http.patch(`/api/organizations/${orgId}/verify`).set(auth(admin)).send({ status: 'ACTIVE' }).expect(200);
  const publish = async (over: Record<string, unknown> = {}) =>
    (
      await http
        .post('/api/offers')
        .set(auth(donor))
        .send({
          categoryCode: 'BAKERY',
          title: 'خبز عربي',
          allergens: ['gluten'],
          allergensDeclared: true,
          storageCondition: 'ROOM_TEMP',
          quantityKg: 20,
          preparedAt: iso(-30),
          pickupBy: iso(240),
          ...over,
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    ({ app, db } = await bootFreshApp());
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
    http = request(app.getHttpServer());
    admin = (await http.post('/api/auth/login').send(await createAdmin(db)).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    clients.forEach((c) => c.close());
    await app?.close();
  });

  describe('connection', () => {
    it('refuses a socket without a token or with a bad token', async () => {
      await expect(Client.connect(baseUrl)).rejects.toThrow('AUTH_REQUIRED');
      await expect(Client.connect(baseUrl, 'not-a-jwt')).rejects.toThrow('TOKEN_INVALID');
    });
  });

  describe('accounts', () => {
    it('admins hear about new registrations, the organization hears about its verification', async () => {
      const adminSocket = await connect(admin);
      const d = await register(donorPayload('owner@yasmin.sy'));
      donor = d.accessToken;
      donorOrgId = d.organization.id;

      const n = await adminSocket.waitFor('org.pending_verification');
      expect(n.title).toBe('جهة جديدة بانتظار التحقق');
      expect(n.body).toContain('مطعم الياسمين');
      expect(n.data).toMatchObject({ orgId: donorOrgId, type: 'RESTAURANT' });

      const donorSocket = await connect(donor);
      await verify(donorOrgId);
      expect((await donorSocket.waitFor('org.verified')).title).toBe('تم تفعيل حسابك');
    });
  });

  describe('new offers', () => {
    let near: Client;
    let far: Client;
    let pendingNear: Client;

    beforeAll(async () => {
      const n = await register(charityPayload('near@charity.org'));
      nearCharity = n.accessToken;
      await verify(n.organization.id);
      const f = await register({
        ...charityPayload('far@charity.org'),
        organization: { ...charityPayload('x').organization, name: 'جمعية بعيدة', location: { lat: 33.9, lng: 36.3 } },
      });
      farCharity = f.accessToken;
      await verify(f.organization.id);
      // registered but not verified yet
      const p = await register(charityPayload('pending@charity.org'));

      near = await connect(nearCharity);
      far = await connect(farCharity);
      pendingNear = await connect(p.accessToken);
    });

    it('reach verified charities within the service radius only', async () => {
      const offerId = await publish();
      const n = await near.waitFor('offer.new_match');
      expect(n).toMatchObject({ title: 'عرض جديد مناسب لكم', data: { offerId, area: 'المزة' } });
      expect(n.body).toBe('مطعم الياسمين نشر «خبز عربي» (20 كغ) في المزة.');

      await settle();
      expect(far.received.some((x) => x.type === 'offer.new_match')).toBe(false);
      expect(pendingNear.received.some((x) => x.type === 'offer.new_match')).toBe(false);
    });

    it('every open tab of the same account receives it', async () => {
      const secondTab = await connect(nearCharity);
      await publish({ title: 'كعك' });
      const n = await secondTab.waitFor('offer.new_match');
      expect(n.body).toContain('كعك');
    });
  });

  describe('claims', () => {
    it('MANUAL: the donor is asked in real time, the charity hears the answer', async () => {
      await http.patch('/api/organizations/me/settings').set(auth(donor)).send({ claimApprovalMode: 'MANUAL' }).expect(200);
      const offerId = await publish({ title: 'معجنات' });
      const donorSocket = await connect(donor);
      const charitySocket = await connect(nearCharity);

      const claim = (
        await http.post(`/api/offers/${offerId}/claims`).set(auth(nearCharity)).send({ quantityKg: 6 }).expect(201)
      ).body;
      const ask = await donorSocket.waitFor('claim.pending_approval');
      expect(ask.title).toBe('طلب استلام بانتظار موافقتك');
      expect(ask.body).toMatch(/^جمعية بسمة الخير تطلب 6 كغ من «معجنات»\. الرد خلال 1[45] دقيقة\.$/);
      expect(ask.data).toMatchObject({ claimId: claim.id, offerId });

      await http.post(`/api/claims/${claim.id}/approve`).set(auth(donor)).expect(200);
      const ok = await charitySocket.waitFor('claim.approved');
      expect(ok.body).toMatch(/^وافق مطعم الياسمين على 6 كغ من «معجنات»\. الاستلام خلال 4[45] دقيقة\.$/);

      // pickup confirmation reaches the charity
      const mine = (await http.get(`/api/claims/${claim.id}`).set(auth(nearCharity)).expect(200)).body;
      await http.post('/api/claims/confirm-pickup').set(auth(donor)).send({ qrToken: mine.qrPayload }).expect(200);
      expect((await charitySocket.waitFor('claim.picked_up')).body).toBe('تم استلام 6 كغ من «معجنات». شكراً لكم!');
    });

    it('a failed request sends nothing: notifications commit or roll back with the change', async () => {
      const offerId = await publish({ title: 'كمية صغيرة', quantityKg: 2 });
      const donorSocket = await connect(donor);
      const [{ n: before }] = await db.query(`SELECT count(*)::int AS n FROM notifications`);

      await http.post(`/api/offers/${offerId}/claims`).set(auth(farCharity)).send({ quantityKg: 5 }).expect(409);

      await settle();
      const [{ n: after }] = await db.query(`SELECT count(*)::int AS n FROM notifications`);
      expect(after).toBe(before);
      expect(donorSocket.received).toHaveLength(0);
    });

    it('rejection and offer cancellation reach the charity', async () => {
      const charitySocket = await connect(farCharity);
      const offerId = await publish({ title: 'فطائر' });
      const c1 = (
        await http.post(`/api/offers/${offerId}/claims`).set(auth(farCharity)).send({ quantityKg: 3 }).expect(201)
      ).body;
      await http.post(`/api/claims/${c1.id}/reject`).set(auth(donor)).send({ reason: 'محجوز لجهة أخرى' }).expect(200);
      expect((await charitySocket.waitFor('claim.rejected')).body).toBe(
        'رفض مطعم الياسمين طلب «فطائر». السبب: محجوز لجهة أخرى',
      );

      await http.patch('/api/organizations/me/settings').set(auth(donor)).send({ claimApprovalMode: 'AUTO' }).expect(200);
      await http.post(`/api/offers/${offerId}/claims`).set(auth(farCharity)).send({ quantityKg: 3 }).expect(201);
      await http.patch(`/api/offers/${offerId}/cancel`).set(auth(donor)).send({}).expect(200);
      expect((await charitySocket.waitFor('claim.cancelled_by_donor')).body).toBe(
        'ألغى مطعم الياسمين عرض «فطائر»، فأُلغي حجزك.',
      );
    });

    it('a no-show notifies both sides (sent by the background sweep)', async () => {
      const donorSocket = await connect(donor);
      const charitySocket = await connect(nearCharity);
      const offerId = await publish({ title: 'سمبوسك' });
      const c = (
        await http.post(`/api/offers/${offerId}/claims`).set(auth(nearCharity)).send({ quantityKg: 4 }).expect(201)
      ).body;
      await db.query(`UPDATE claims SET reserved_until = now() - interval '1 second' WHERE id = $1`, [c.id]);
      await app.get(ClaimsService).sweepExpired();

      expect((await charitySocket.waitFor('claim.expired.charity')).title).toBe('انتهت مدة الحجز');
      expect((await donorSocket.waitFor('claim.expired.donor')).body).toBe(
        'جمعية بسمة الخير لم تستلم 4 كغ من «سمبوسك»، وعادت الكمية للعرض.',
      );
    });
  });

  describe('notification center (REST, for people who were offline)', () => {
    it('stores everything, counts unread, marks read', async () => {
      const list = await http.get('/api/notifications').set(auth(nearCharity)).expect(200);
      expect(list.body.items.length).toBeGreaterThan(3);
      const ids = list.body.items.map((n: Note) => Number(n.id));
      expect(ids).toEqual([...ids].sort((a, b) => b - a)); // newest first

      const { unread } = (await http.get('/api/notifications/unread-count').set(auth(nearCharity)).expect(200)).body;
      expect(unread).toBe(list.body.items.length);

      const first = list.body.items[0];
      const after = await http.patch(`/api/notifications/${first.id}/read`).set(auth(nearCharity)).expect(200);
      expect(after.body.unread).toBe(unread - 1);
      const unreadOnly = await http.get('/api/notifications?unreadOnly=true').set(auth(nearCharity)).expect(200);
      expect(unreadOnly.body.items.some((n: Note) => n.id === first.id)).toBe(false);

      await http.post('/api/notifications/read-all').set(auth(nearCharity)).expect(200);
      expect((await http.get('/api/notifications/unread-count').set(auth(nearCharity)).expect(200)).body.unread).toBe(0);
    });

    it("cannot read or mark someone else's notifications", async () => {
      const theirs = (await http.get('/api/notifications').set(auth(donor)).expect(200)).body.items[0];
      await http.patch(`/api/notifications/${theirs.id}/read`).set(auth(nearCharity)).expect(404);
      const mine = (await http.get('/api/notifications').set(auth(nearCharity)).expect(200)).body.items;
      expect(mine.some((n: Note) => n.id === theirs.id)).toBe(false);
    });

    it('paginates with a cursor', async () => {
      const p1 = await http.get('/api/notifications?limit=2').set(auth(donor)).expect(200);
      expect(p1.body.items).toHaveLength(2);
      const p2 = await http.get(`/api/notifications?limit=2&cursor=${p1.body.nextCursor}`).set(auth(donor)).expect(200);
      expect(Number(p2.body.items[0].id)).toBeLessThan(Number(p1.body.items[1].id));
    });
  });
});

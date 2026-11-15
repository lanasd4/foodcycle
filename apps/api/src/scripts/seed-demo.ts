/**
 * Demo data for local development and UI work (never run in production).
 *   npm run seed:demo -w @foodcycle/api
 *
 * Creates donors, charities (with needs), offers in every state, claims,
 * pickups in the past (so the impact dashboard has data) and ratings.
 * Safe to run twice: it stops if the demo donor already exists.
 *
 * Every demo account uses the same TEST password below. Admin: see seed-admin.
 */
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

export const DEMO_PASSWORD = 'demo-password-2026';

const DAMASCUS = {
  mezzeh: { lat: 33.5032, lng: 36.2496 },
  shaalan: { lat: 33.5158, lng: 36.2875 },
  bahsa: { lat: 33.5128, lng: 36.2953 },
  kafarsouseh: { lat: 33.4972, lng: 36.2716 },
  midan: { lat: 33.4925, lng: 36.301 },
  muhajirin: { lat: 33.531, lng: 36.278 },
};

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo refuses to run in production.');
  process.exit(1);
}
process.env.JOBS_ENABLED = 'false';
const { AppModule } = await import('../app.module.js');
const { AuthService } = await import('../auth/auth.service.js');
const { OrganizationsService } = await import('../organizations/organizations.service.js');
const { OffersService } = await import('../offers/offers.service.js');
const { ClaimsService } = await import('../claims/claims.service.js');
const { CharityNeedsService } = await import('../matching/charity-needs.js');
const { RatingsService } = await import('../claims/ratings.js');
const { runWithContext } = await import('../common/request-context.js');

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const db = app.get<DataSource>(getDataSourceToken());
const auth = app.get(AuthService);
const orgs = app.get(OrganizationsService);
const offers = app.get(OffersService);
const claims = app.get(ClaimsService);
const needs = app.get(CharityNeedsService);
const ratings = app.get(RatingsService);

type Who = { id: string; email: string; role: 'DONOR' | 'CHARITY' | 'ADMIN'; orgId: string | null; orgStatus: 'ACTIVE' | null };

await runWithContext({ requestId: 'seed-demo', actorRole: 'SYSTEM' }, async () => {
  const exists = await db.query(`SELECT 1 FROM users WHERE email = 'yasmin@demo.foodcycle'`);
  if (exists.length) {
    console.log('Demo data already present, nothing to do.');
    return;
  }
  const [adminRow] = await db.query(`SELECT id, email FROM users WHERE role = 'ADMIN' LIMIT 1`);
  if (!adminRow) {
    console.error('Run seed:admin first.');
    return;
  }
  const admin: Who = { id: adminRow.id, email: adminRow.email, role: 'ADMIN', orgId: null, orgStatus: null };

  async function create(
    email: string,
    role: 'DONOR' | 'CHARITY',
    o: { name: string; type: string; area: string; address: string; location: { lat: number; lng: number } },
    verify = true,
  ): Promise<Who> {
    const res = await auth.register({
      email,
      password: DEMO_PASSWORD,
      role,
      organization: { ...o, phone: '+963 11 000 0000', type: o.type as never },
    });
    if (verify) await orgs.setStatus(admin, res.organization!.id, { status: 'ACTIVE' });
    return { id: res.user.id, email, role, orgId: res.organization!.id, orgStatus: 'ACTIVE' };
  }

  // ---------- organizations
  const yasmin = await create('yasmin@demo.foodcycle', 'DONOR', {
    name: 'مطعم الياسمين', type: 'RESTAURANT', area: 'المزة', address: 'المزة، الشارع الرئيسي', location: DAMASCUS.mezzeh,
  });
  const sanabel = await create('sanabel@demo.foodcycle', 'DONOR', {
    name: 'مخبز السنابل', type: 'BAKERY', area: 'الشعلان', address: 'الشعلان، جانب الحديقة', location: DAMASCUS.shaalan,
  });
  const sham = await create('sham@demo.foodcycle', 'DONOR', {
    name: 'فندق الشام', type: 'HOTEL', area: 'البحصة', address: 'البحصة، ساحة يوسف العظمة', location: DAMASCUS.bahsa,
  });
  const reef = await create('reef@demo.foodcycle', 'DONOR', {
    name: 'سوبرماركت الريف', type: 'GROCERY', area: 'كفرسوسة', address: 'كفرسوسة، المتحلق الجنوبي', location: DAMASCUS.kafarsouseh,
  });
  const basma = await create('basma@demo.foodcycle', 'CHARITY', {
    name: 'جمعية بسمة الخير', type: 'CHARITY', area: 'كفرسوسة', address: 'كفرسوسة، جانب الجامع', location: DAMASCUS.kafarsouseh,
  });
  const nour = await create('nour@demo.foodcycle', 'CHARITY', {
    name: 'جمعية نور الأمل', type: 'CHARITY', area: 'الميدان', address: 'الميدان، شارع الميدان', location: DAMASCUS.midan,
  });
  const ihsan = await create('ihsan@demo.foodcycle', 'CHARITY', {
    name: 'مؤسسة الإحسان', type: 'HUMANITARIAN', area: 'المهاجرين', address: 'المهاجرين، الجادة الخامسة', location: DAMASCUS.muhajirin,
  });
  await create(
    'pending@demo.foodcycle',
    'CHARITY',
    { name: 'جمعية الأمل الجديد', type: 'CHARITY', area: 'المزة', address: 'المزة فيلات', location: DAMASCUS.mezzeh },
    false,
  );

  await orgs.updateSettings(sham, { claimApprovalMode: 'MANUAL' });
  await needs.put(basma, {
    acceptedCategories: ['COOKED', 'SANDWICHES', 'BAKERY', 'PRODUCE'],
    preferredCategories: ['COOKED'],
    dailyCapacityKg: 40,
    pickupHours: null,
  });
  await needs.put(nour, {
    acceptedCategories: ['BAKERY', 'DESSERTS', 'DRY_GOODS', 'CANNED'],
    preferredCategories: ['BAKERY'],
    dailyCapacityKg: 25,
    pickupHours: { start: '08:00', end: '23:00' },
  });

  // ---------- offers
  const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  const offer = (who: Who, o: Record<string, unknown>) => offers.create(who, o as never);

  const rice = await offer(yasmin, {
    categoryCode: 'COOKED', title: 'أرز بالدجاج وخضار مشكّلة', ingredients: 'أرز بسمتي، دجاج، بازلاء، جزر، زبدة',
    allergens: ['dairy'], allergensDeclared: true, storageCondition: 'HOT', quantityKg: 18,
    preparedAt: at(-150), pickupBy: at(120),
  });
  await offer(sanabel, {
    categoryCode: 'BAKERY', title: 'خبز عربي ومعجنات صباحية', allergens: ['gluten', 'sesame', 'eggs'],
    allergensDeclared: true, storageCondition: 'ROOM_TEMP', quantityKg: 25, preparedAt: at(-120), pickupBy: at(150),
  });
  const buffet = await offer(sham, {
    categoryCode: 'COOKED', title: 'بوفيه عشاء: كبة ومحاشي وسلطات', ingredients: 'برغل، لحم، أرز، خضار',
    allergens: ['gluten'], allergensDeclared: true, storageCondition: 'REFRIGERATED', quantityKg: 30,
    preparedAt: at(-60), pickupBy: at(170),
  });
  await offer(reef, {
    categoryCode: 'PRODUCE', title: 'خضار وفواكه طازجة', allergens: [], allergensDeclared: true,
    storageCondition: 'REFRIGERATED', quantityKg: 40, preparedAt: at(-60), pickupBy: at(600),
  });
  await offer(sanabel, {
    categoryCode: 'DESSERTS', title: 'كعك بالتمر', allergens: ['gluten', 'dairy'], allergensDeclared: true,
    storageCondition: 'ROOM_TEMP', portions: 60, preparedAt: at(-30), pickupBy: at(900),
  });
  await offer(reef, {
    categoryCode: 'CANNED', title: 'معلبات حمص وفول', allergens: [], allergensDeclared: true,
    storageCondition: 'ROOM_TEMP', quantityKg: 15, preparedAt: at(-60), pickupBy: at(3 * 24 * 60),
  });

  // ---------- claims in different states
  await claims.create(basma, rice.id, { quantityKg: 8 }); // RESERVED (AUTO)
  await claims.create(nour, buffet.id, { quantityKg: 10 }); // PENDING_APPROVAL (hotel is MANUAL)

  // ---------- past activity for the impact dashboard (picked up, then backdated)
  const history: [Who, Who, string, string, number, number][] = [
    // donor, charity, category, title, kg, days ago
    [yasmin, basma, 'COOKED', 'مقلوبة', 12, 2],
    [sanabel, nour, 'BAKERY', 'خبز صمون', 20, 3],
    [sanabel, basma, 'BAKERY', 'خبز عربي', 15, 6],
    [reef, ihsan, 'PRODUCE', 'بطاطا وبندورة', 35, 9],
    [sham, basma, 'COOKED', 'بوفيه غداء', 22, 12],
    [yasmin, ihsan, 'COOKED', 'شاورما وأرز', 9, 16],
    [sanabel, nour, 'DESSERTS', 'معمول', 8, 21],
    [reef, nour, 'CANNED', 'معلبات', 18, 25],
    [sham, ihsan, 'COOKED', 'فطور فندقي', 14, 40],
  ];
  for (const [donor, charity, cat, title, kg, daysAgo] of history) {
    const o = await offer(donor, {
      categoryCode: cat, title, allergens: [], allergensDeclared: true,
      storageCondition: cat === 'COOKED' ? 'HOT' : 'ROOM_TEMP', quantityKg: kg, preparedAt: at(-20), pickupBy: at(200),
    });
    let c = await claims.create(charity, o.id, { quantityKg: kg });
    if (c.status === 'PENDING_APPROVAL') c = await claims.approve(donor, c.id);
    const [{ qr_token }] = await db.query(`SELECT qr_token FROM claims WHERE id = $1`, [c.id]);
    await claims.confirmPickup(donor, { qrToken: qr_token });
    await ratings.rate(charity, c.id, { score: daysAgo % 3 === 0 ? 4 : 5 });
    await ratings.rate(donor, c.id, { score: 5, comment: 'التزام بالموعد' });
    await db.query(
      `UPDATE claims SET picked_up_at = now() - make_interval(days => $2), created_at = now() - make_interval(days => $2)
        WHERE id = $1`,
      [c.id, daysAgo],
    );
    await db.query(`UPDATE offers SET created_at = now() - make_interval(days => $2) WHERE id = $1`, [o.id, daysAgo]);
  }

  console.log('Demo data created. Accounts (password: DEMO_PASSWORD in this file):');
  for (const e of ['yasmin', 'sanabel', 'sham', 'reef', 'basma', 'nour', 'ihsan', 'pending']) {
    console.log(`  ${e}@demo.foodcycle`);
  }
});

await app.close();

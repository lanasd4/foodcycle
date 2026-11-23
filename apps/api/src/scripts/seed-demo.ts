/**
 * Demo data for local development and UI work (never run in production).
 *   npm run seed:demo -w @foodcycle/api
 *
 * Creates donors, charities (with needs), offers in every state, claims,
 * pickups in the past (so the impact dashboard has data) and ratings.
 * Two cities: Damascus and Aleppo. Each city's data is created only if it is
 * missing, so running it again (or after an update that added a city) is safe.
 *
 * Every demo account uses the same TEST password below. Admin: see seed-admin.
 */
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CITY_INFO, type City } from '@foodcycle/shared';
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

/** A neighbourhood's point (checked against OpenStreetMap, see CITY_INFO). */
function areaPoint(city: City, name: string) {
  const a = CITY_INFO[city].areas.find((x) => x.name === name);
  if (!a) throw new Error(`Unknown area ${name} in ${city}`);
  return a.location;
}

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
type OrgInput = { name: string; type: string; area: string; address: string; location: { lat: number; lng: number }; city?: City };

await runWithContext({ requestId: 'seed-demo', actorRole: 'SYSTEM' }, async () => {
  const has = async (email: string) => (await db.query(`SELECT 1 FROM users WHERE email = $1`, [email])).length > 0;
  const [adminRow] = await db.query(`SELECT id, email FROM users WHERE role = 'ADMIN' LIMIT 1`);
  if (!adminRow) {
    console.error('Run seed:admin first.');
    return;
  }
  const admin: Who = { id: adminRow.id, email: adminRow.email, role: 'ADMIN', orgId: null, orgStatus: null };

  async function create(email: string, role: 'DONOR' | 'CHARITY', o: OrgInput, verify = true): Promise<Who> {
    const city = o.city ?? 'DAMASCUS';
    const res = await auth.register({
      email,
      password: DEMO_PASSWORD,
      role,
      organization: { ...o, city, phone: city === 'ALEPPO' ? '+963 21 000 0000' : '+963 11 000 0000', type: o.type as never },
    });
    if (verify) await orgs.setStatus(admin, res.organization!.id, { status: 'ACTIVE' });
    return { id: res.user.id, email, role, orgId: res.organization!.id, orgStatus: 'ACTIVE' };
  }

  const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  const offer = (who: Who, o: Record<string, unknown>) => offers.create(who, o as never);

  /** A completed pickup in the past, rated by both sides, for the impact dashboard. */
  async function pastPickup(donor: Who, charity: Who, cat: string, title: string, kg: number, daysAgo: number) {
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

  // ================================================================ Damascus
  if (await has('yasmin@demo.foodcycle')) {
    console.log('Damascus demo data already present.');
  } else {
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

    // ---------- past activity for the impact dashboard
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
    for (const h of history) await pastPickup(...h);
    console.log('Damascus demo data created.');
  }

  // ================================================================ Aleppo
  if (await has('halab@demo.foodcycle')) {
    console.log('Aleppo demo data already present.');
  } else {
    const A = (name: string) => areaPoint('ALEPPO', name);
    const halab = await create('halab@demo.foodcycle', 'DONOR', {
      city: 'ALEPPO', name: 'مطعم بيت حلب', type: 'RESTAURANT', area: 'العزيزية', address: 'العزيزية، قرب الساحة', location: A('العزيزية'),
    });
    const shahba = await create('shahba@demo.foodcycle', 'DONOR', {
      city: 'ALEPPO', name: 'مخبز الشهباء', type: 'BAKERY', area: 'المحافظة', address: 'المحافظة، قرب الدوار', location: A('المحافظة'),
    });
    const qalaa = await create('qalaa@demo.foodcycle', 'DONOR', {
      city: 'ALEPPO', name: 'فندق القلعة', type: 'HOTEL', area: 'باب الفرج', address: 'باب الفرج، قرب برج الساعة', location: A('باب الفرج'),
    });
    const khair = await create('khair@demo.foodcycle', 'CHARITY', {
      city: 'ALEPPO', name: 'جمعية حلب الخير', type: 'CHARITY', area: 'الجميلية', address: 'الجميلية، قرب الساحة', location: A('الجميلية'),
    });
    const rahma = await create('rahma@demo.foodcycle', 'CHARITY', {
      city: 'ALEPPO', name: 'مؤسسة الرحمة', type: 'HUMANITARIAN', area: 'سيف الدولة', address: 'سيف الدولة، الشارع الرئيسي', location: A('سيف الدولة'),
    });

    await orgs.updateSettings(qalaa, { claimApprovalMode: 'MANUAL' });
    await needs.put(khair, {
      acceptedCategories: ['COOKED', 'BAKERY', 'PRODUCE', 'DRY_GOODS'],
      preferredCategories: ['COOKED'],
      dailyCapacityKg: 35,
      pickupHours: null,
    });
    await needs.put(rahma, {
      acceptedCategories: ['BAKERY', 'DESSERTS', 'CANNED', 'DRY_GOODS'],
      preferredCategories: ['BAKERY'],
      dailyCapacityKg: 20,
      pickupHours: { start: '08:00', end: '23:00' },
    });

    const kebab = await offer(halab, {
      categoryCode: 'COOKED', title: 'كباب حلبي مع أرز وسلطة', ingredients: 'لحم، أرز، بندورة، بقدونس',
      allergens: [], allergensDeclared: true, storageCondition: 'HOT', quantityKg: 15, preparedAt: at(-90), pickupBy: at(140),
    });
    await offer(shahba, {
      categoryCode: 'BAKERY', title: 'خبز وكعك بالسمسم', allergens: ['gluten', 'sesame'], allergensDeclared: true,
      storageCondition: 'ROOM_TEMP', quantityKg: 20, preparedAt: at(-100), pickupBy: at(240),
    });
    await offer(qalaa, {
      categoryCode: 'COOKED', title: 'بوفيه: كبة وفتة ومحاشي', ingredients: 'برغل، لحم، حمص، لبن، أرز',
      allergens: ['gluten', 'dairy'], allergensDeclared: true, storageCondition: 'REFRIGERATED', quantityKg: 25,
      preparedAt: at(-45), pickupBy: at(180),
    });
    await claims.create(khair, kebab.id, { quantityKg: 6 }); // RESERVED (AUTO)

    const history: [Who, Who, string, string, number, number][] = [
      [halab, khair, 'COOKED', 'يبرق وأرز', 10, 1],
      [shahba, rahma, 'BAKERY', 'خبز عربي', 18, 4],
      [qalaa, khair, 'COOKED', 'بوفيه غداء', 16, 8],
      [shahba, khair, 'BAKERY', 'معجنات', 9, 13],
      [halab, rahma, 'COOKED', 'محاشي', 7, 20],
    ];
    for (const h of history) await pastPickup(...h);
    console.log('Aleppo demo data created.');
  }

  console.log('Accounts (password: DEMO_PASSWORD in this file):');
  console.log('  Damascus: yasmin, sanabel, sham, reef, basma, nour, ihsan, pending  @demo.foodcycle');
  console.log('  Aleppo:   halab, shahba, qalaa, khair, rahma                         @demo.foodcycle');
});

await app.close();

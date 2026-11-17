# FoodCycle

**كل وجبة تستحق فرصة ثانية.**
منصة تربط المطاعم والفنادق والمخابز والمتاجر الغذائية بالجمعيات الخيرية، لتصل الأطعمة الفائضة الصالحة للاستهلاك إلى المحتاجين قبل أن تُهدر.

- **الجهة المانحة** تنشر الفائض في دقيقة، مع تفاصيل السلامة (الصنف، الحفظ، مسببات الحساسية).
- **الجمعية** يصلها إشعار فوري بالعروض المناسبة لها، تحجز الكمية التي تحتاجها، وتستلم بـ QR.
- **الأدمن** يتحقق من الجهات، ويتابع الأثر على لوحة تحليلات، ويضبط أوزان المطابقة.

## المستندات

| المستند | المحتوى |
|---|---|
| [docs/PROJECT-GUIDE.md](docs/PROJECT-GUIDE.md) | **ابدأ هنا**: شرح المشروع بالمخططات والـ ERD، التشغيل خطوة بخطوة، الحسابات التجريبية، وشرح كل ملف |
| [FoodCycle-Technical-Plan-v2.md](FoodCycle-Technical-Plan-v2.md) | الخطة التقنية وسجل قرارات التنفيذ (القسم 15) |
| [docs/ALGORITHMS.md](docs/ALGORITHMS.md) | شرح الخوارزميات بالصيغ وأمثلة محسوبة |
| [docs/DEMO.md](docs/DEMO.md) | سيناريو العرض التجريبي (15 دقيقة) |
| [DESIGN.md](DESIGN.md) | نظام التصميم: الهوية، الألوان، المكونات، القواعد |
| [docs/LEARNING-GUIDE.md](docs/LEARNING-GUIDE.md) | شرح كل مفاهيم المشروع من الصفر |
| `http://localhost:3000/api/docs` | توثيق الـ API التفاعلي (Swagger) |

## البنية

```
apps/api          NestJS 12 + TypeORM + PostgreSQL/PostGIS + Redis/BullMQ + Socket.IO
apps/web          React 19 + Vite + Tailwind 4 + TanStack Query + Leaflet + Chart.js (PWA)
packages/shared   ثوابت وأنواع مشتركة (الأدوار، الحالات، مسببات الحساسية…)
infra/db          تهيئة قاعدة البيانات في Docker
docs/             الشرح والتوثيق
```

| الخدمة | المنفذ (تطوير) |
|---|---|
| الواجهة (Vite) | 5173 |
| الـ API | 3000 (`/api`، والتوثيق على `/api/docs`) |
| PostgreSQL + PostGIS (Docker) | **5433** (لأن PostgreSQL محلياً يستخدم 5432) |
| Redis (Docker) | 6379 |

## المتطلبات

- Node.js **22.18** أو أحدث
- Docker Desktop (يجب أن يكون شغالاً أثناء العمل)

## التشغيل لأول مرة

```bash
npm install
cp apps/api/.env.example apps/api/.env      # ثم ضع ADMIN_PASSWORD (12 حرفاً على الأقل)
npm run db:up                               # PostGIS + Redis
npm run dev:api                             # يطبّق الـ migrations تلقائياً
npm run seed:admin                          # أول حساب أدمن
npm run seed:demo                           # بيانات تجريبية (اختياري)
npm run dev:web                             # http://localhost:5173
```

**الحسابات التجريبية** (`seed:demo`): `yasmin@demo.foodcycle`، `sham@demo.foodcycle`، `basma@demo.foodcycle`، `nour@demo.foodcycle` وغيرها.
كلمة المرور التجريبية في `apps/api/src/scripts/seed-demo.ts` (`DEMO_PASSWORD`). لا تُشغَّل في الإنتاج (السكربت يرفض).

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev:api` / `npm run dev:web` | التطوير مع إعادة التحميل التلقائي |
| `npm run db:up` / `npm run db:down` | تشغيل / إيقاف قاعدة البيانات و Redis |
| `npm run seed:admin` | إنشاء أول أدمن من `apps/api/.env` |
| `npm run seed:demo` | بيانات تجريبية واقعية في دمشق |
| `npm run test:api` | اختبارات وحدة الـ API (بدون قاعدة بيانات) |
| `npm run test:e2e` | اختبارات e2e على قاعدة `foodcycle_test` (تُمسح في كل تشغيل) |
| `npm run test:perf -w @foodcycle/api` | اختبار الحمل (1,000 عرض، 300 جمعية) |
| `npm test -w @foodcycle/web` | اختبارات وحدة الواجهة |
| `npm run build:api` / `npm run build:web` | بناء الإنتاج |

## الجودة

| الفحص | النتيجة |
|---|---|
| اختبارات e2e (قاعدة بيانات حقيقية) | 97 |
| اختبارات وحدة الـ API | 66 |
| اختبارات وحدة الواجهة | 10 |
| اختبار الحمل: p95 لكل العمليات | أقل من 300 مللي ثانية (أبطؤها النشر: 253) |
| Lint (oxlint) | نظيف |

تشمل الاختبارات: 10 حجوزات متزامنة على نفس العرض، تراجع التغيير إن فشل سجل التدقيق، منع تعديل أو حذف سجل التدقيق، عدم تسريب الأسرار، الإشعارات عبر اتصال Socket.IO حقيقي، وأرقام لوحة الأثر مقارنةً بحساب يدوي.

## الإنتاج (خادم واحد بـ Docker)

```bash
cp .env.prod.example .env.prod                # ضع أسراراً حقيقية طويلة وعشوائية
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/scripts/seed-admin.js
```

- **nginx** يخدم الواجهة ويوجّه `/api` و `/socket.io` للـ API: أصل واحد للمتصفح.
- الـ migrations تُطبَّق تلقائياً عند تشغيل الـ API.
- Swagger معطّل في الإنتاج.
- **قبل الإطلاق الفعلي:**
  - شهادة HTTPS أمام nginx.
  - مزوّد خرائط بدل خوادم OpenStreetMap العامة (مخصصة للتطوير حسب سياسة استخدامها).
  - نسخ احتياطي دوري لقاعدة البيانات.
  - مراقبة الأخطاء.

## قرارات مفتوحة

اقتُرحت ولم تُعتمد بعد (التفاصيل في الخطة، القسم 13): إخفاء العنوان الدقيق قبل الحجز، Rate limiting، Web Push و SMS/WhatsApp، النسخ الاحتياطي والمراقبة، سياسة حذف البيانات الشخصية، Refresh tokens.

## ملاحظات

- `.npmrc` فيه `legacy-peer-deps=true` لتجاوز خلل معروف في npm مع حزم Vitest.
- `packages/shared` مكتوبة بـ TypeScript وتعمل مباشرة عبر ميزة إزالة الأنواع في Node 22.18+.

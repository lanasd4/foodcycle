# FoodCycle

منصة لتقليل هدر الطعام: تربط المطاعم والفنادق والمخابز والمتاجر بالجمعيات الخيرية.

| المستند | المحتوى |
|---|---|
| [FoodCycle-Technical-Plan-v2.md](FoodCycle-Technical-Plan-v2.md) | الخطة التقنية |
| [DESIGN.md](DESIGN.md) | نظام التصميم |
| [docs/LEARNING-GUIDE.md](docs/LEARNING-GUIDE.md) | شرح كل مفاهيم المشروع من الصفر |

## البنية

```
apps/api         NestJS + TypeORM + PostgreSQL/PostGIS   (port 3000, /api, docs: /api/docs)
apps/web         React + Vite + Tailwind                 (port 5173)
packages/shared  ثوابت وأنواع مشتركة بين الطرفين
infra/db         سكربتات تهيئة قاعدة البيانات
```

## المتطلبات

- Node.js 22.18 أو أحدث
- Docker Desktop (لـ PostgreSQL + PostGIS و Redis)

> قاعدة بيانات Docker على المنفذ **5433** لأن عندك PostgreSQL محلي على 5432.

## التشغيل لأول مرة

```bash
npm install
cp apps/api/.env.example apps/api/.env   # ثم عدّل ADMIN_PASSWORD و JWT_SECRET
npm run db:up                            # PostGIS + Redis
npm run dev:api                          # يطبّق الـ migrations تلقائياً
npm run seed:admin                       # أول حساب أدمن
npm run dev:web
```

## الاختبارات

```bash
npm run test:api     # اختبارات الوحدة (بدون قاعدة بيانات)
npm run test:e2e     # اختبارات e2e على قاعدة foodcycle_test (تُمسح في كل تشغيل)
```

## ملاحظات

- `.npmrc` فيه `legacy-peer-deps=true` لتجاوز خلل معروف في npm مع حزم Vitest.

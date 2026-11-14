/**
 * Creates the first ADMIN account (admins cannot self-register).
 *   npm run seed:admin -w @foodcycle/api
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from apps/api/.env. Safe to run twice.
 */
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import type { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../users/user.entity.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 chars) in apps/api/.env first.');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const db = app.get<DataSource>(getDataSourceToken());
const audit = app.get(AuditService);

const existing = await db.getRepository(User).findOneBy({ email });
if (existing) {
  console.log(`Admin ${email} already exists, nothing to do.`);
} else {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.transaction(async (m) => {
    const admin = await m.save(m.create(User, { email, passwordHash, role: 'ADMIN' }));
    await audit.record(m, {
      action: 'auth.register',
      entityType: 'user',
      entityId: admin.id,
      after: { email, role: 'ADMIN', via: 'seed-admin script' },
    });
  });
  console.log(`Admin ${email} created.`);
}
await app.close();

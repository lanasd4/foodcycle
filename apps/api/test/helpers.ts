import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup.js';

/** Drops and recreates the test schema, then boots the app (migrations run on boot). */
export async function bootFreshApp(): Promise<{ app: INestApplication; db: DataSource }> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: ['error'] }));
  await app.init();
  return { app, db: app.get<DataSource>(getDataSourceToken()) };
}

export async function createAdmin(db: DataSource, email = 'admin@test.local', password = 'admin-password-123') {
  const hash = await bcrypt.hash(password, 4);
  await db.query(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'ADMIN')`, [email, hash]);
  return { email, password };
}

export const donorPayload = (email: string) => ({
  email,
  password: 'donor-password-123',
  role: 'DONOR',
  organization: {
    name: 'مطعم الياسمين',
    type: 'RESTAURANT',
    phone: '+963 11 123 4567',
    address: 'شارع المزة الرئيسي، بناء 12',
    area: 'المزة',
    location: { lat: 33.5032, lng: 36.2496 },
  },
});

export const charityPayload = (email: string) => ({
  email,
  password: 'charity-password-123',
  role: 'CHARITY',
  organization: {
    name: 'جمعية بسمة الخير',
    type: 'CHARITY',
    phone: '+963 11 765 4321',
    address: 'كفرسوسة، جانب الجامع',
    area: 'كفرسوسة',
    location: { lat: 33.4972, lng: 36.2716 },
    registrationNumber: 'CH-2024-117',
  },
});

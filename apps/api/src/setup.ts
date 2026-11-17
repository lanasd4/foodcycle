import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { requestContextMiddleware } from './common/request-context.js';
import type { Env } from './config/env.js';
import type { NextFunction, Request, Response } from 'express';

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

const API_DESCRIPTION = [
  'Food rescue platform: donors publish surplus food, charities reserve and pick it up.',
  '',
  '**Authentication**: `POST /api/auth/login` returns `accessToken`; send it as `Authorization: Bearer <token>`.',
  'Roles: `DONOR`, `CHARITY`, `ADMIN`. Donors and charities must be verified by an admin for most actions',
  '(error `ORG_NOT_VERIFIED`).',
  '',
  '**Errors**: JSON body with a stable `code` (e.g. `INSUFFICIENT_QUANTITY`), sometimes extra fields',
  '(`remainingKg`, `violations`). 400 invalid input, 401 not signed in, 403 role or verification,',
  '404 not found or not yours, 409 state conflict, 422 food-safety rules.',
  '',
  '**Real time**: Socket.IO, namespace `/events`, path `/socket.io`:',
  '`io("<host>/events", { auth: { token } })`. Server events: `ready`, `auth_error`, and `notification`',
  '(same JSON as `GET /api/notifications`). Pushes are sent only after the change is committed.',
  '',
  '**Tracing**: every response carries `x-request-id`, also stored in the audit log.',
].join('\n');

/**
 * Shared app wiring, used by main.ts and by the e2e tests so both run
 * exactly the same middleware, pipes and prefixes.
 */
export function configureApp(app: INestApplication) {
  const cfg = app.get(ConfigService<Env, true>);

  // Don't advertise the framework; basic headers that cost nothing (JSON API, never framed)
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(securityHeaders);
  app.use(requestContextMiddleware);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableCors({
    origin: cfg.get('CORS_ORIGIN', { infer: true }).split(',').map((s: string) => s.trim()),
    exposedHeaders: ['x-request-id'],
  });
  app.enableShutdownHooks();

  if (cfg.get('NODE_ENV', { infer: true }) !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('FoodCycle API')
        .setVersion('1.0')
        .setDescription(API_DESCRIPTION)
        .addBearerAuth()
        .addTag('auth', 'Registration, login, current user')
        .addTag('organizations', 'Organization profile, donor settings, admin verification')
        .addTag('offers', 'Food offers: publish, edit, cancel, Expiry Priority browse')
        .addTag('claims', 'Reservations, approval, pickup confirmation, ratings')
        .addTag('matching', 'Smart Matching and charity needs')
        .addTag('notifications', 'Notification center (real-time delivery: see the description)')
        .addTag('analytics', 'Impact Analytics')
        .addTag('admin', 'Audit log and settings')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
  return app;
}

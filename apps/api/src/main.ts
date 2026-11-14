import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
  console.log(`FoodCycle API listening on http://localhost:${port}/api  (docs: /api/docs)`);
}
await bootstrap();

import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { requestContextMiddleware } from './common/request-context.js';
import type { Env } from './config/env.js';

/**
 * Shared app wiring, used by main.ts and by the e2e tests so both run
 * exactly the same middleware, pipes and prefixes.
 */
export function configureApp(app: INestApplication) {
  const cfg = app.get(ConfigService<Env, true>);

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
      new DocumentBuilder().setTitle('FoodCycle API').setVersion('0.1').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
  return app;
}

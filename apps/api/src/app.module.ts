import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLog } from './audit/audit-log.entity.js';
import { AuditController } from './audit/audit.controller.js';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { Public } from './auth/auth.decorators.js';
import { ActiveOrgGuard, JwtAuthGuard, RolesGuard } from './auth/auth.guards.js';
import { AuthService } from './auth/auth.service.js';
import { type Env, validateEnv } from './config/env.js';
import { MIGRATIONS } from './database/migrations/index.js';
import { Organization } from './organizations/organization.entity.js';
import { OrganizationsController } from './organizations/organizations.controller.js';
import { OrganizationsService } from './organizations/organizations.service.js';
import { User } from './users/user.entity.js';

@Controller('health')
class HealthController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Public()
  @Get()
  async check() {
    await this.db.query('SELECT 1');
    return { status: 'ok', db: 'up', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<Env, true>) => ({
        type: 'postgres',
        url: cfg.get('DATABASE_URL', { infer: true }),
        entities: [User, Organization, AuditLog],
        migrations: MIGRATIONS,
        migrationsRun: true,
        synchronize: false,
        logging: ['error', 'warn'],
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<Env, true>) => ({
        secret: cfg.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: cfg.get('JWT_EXPIRES_IN', { infer: true }) as `${number}h`,
          issuer: 'foodcycle',
        },
        verifyOptions: { issuer: 'foodcycle' },
      }),
    }),
  ],
  controllers: [HealthController, AuthController, OrganizationsController, AuditController],
  providers: [
    AuditService,
    AuthService,
    OrganizationsService,
    // Order matters: authenticate, then check role, then check verification.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ActiveOrgGuard },
  ],
  exports: [AuditService],
})
export class AppModule {}

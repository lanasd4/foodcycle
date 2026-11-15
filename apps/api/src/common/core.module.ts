import { Global, Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** Services used by every domain module. */
@Global()
@Module({
  providers: [AuditService, SettingsService],
  exports: [AuditService, SettingsService],
})
export class CoreModule {}

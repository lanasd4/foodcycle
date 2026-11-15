import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { NotificationsListener } from './notifications.listener.js';
import { NotificationsService } from './notifications.service.js';

/** Global: offers, claims and organizations all announce changes through it. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, NotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}

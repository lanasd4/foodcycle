import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JobsBootstrap, MAINTENANCE_QUEUE, MaintenanceProcessor } from '../jobs/jobs.js';
import { OfferExpiryService } from './offer-expiry.service.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  controllers: [OffersController],
  providers: [OffersService, OfferExpiryService, MaintenanceProcessor, JobsBootstrap],
  exports: [OffersService, OfferExpiryService],
})
export class OffersModule {}

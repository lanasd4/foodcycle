import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ClaimsController } from '../claims/claims.controller.js';
import { ClaimsService } from '../claims/claims.service.js';
import { JobsBootstrap, MAINTENANCE_QUEUE, MaintenanceProcessor } from '../jobs/jobs.js';
import { OfferExpiryService } from './offer-expiry.service.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

/** Offers and claims live together: their state changes are tightly linked (quantities, cancellations). */
@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  controllers: [OffersController, ClaimsController],
  providers: [OffersService, ClaimsService, OfferExpiryService, MaintenanceProcessor, JobsBootstrap],
  exports: [OffersService, ClaimsService, OfferExpiryService],
})
export class OffersModule {}

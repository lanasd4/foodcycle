import { BullModule } from '@nestjs/bullmq';
import { AnalyticsController } from '../analytics/analytics.controller.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { Module } from '@nestjs/common';
import { ClaimsController } from '../claims/claims.controller.js';
import { ClaimsService } from '../claims/claims.service.js';
import { RatingsService } from '../claims/ratings.js';
import { TrustService } from '../organizations/trust.js';
import { CharityNeedsService } from '../matching/charity-needs.js';
import { MatchingController } from '../matching/matching.controller.js';
import { MatchingService } from '../matching/matching.service.js';
import { JobsBootstrap, MAINTENANCE_QUEUE, MaintenanceProcessor } from '../jobs/jobs.js';
import { OfferExpiryService } from './offer-expiry.service.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

/** Offers and claims live together: their state changes are tightly linked (quantities, cancellations). */
@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  // MatchingController first: GET /offers/recommended must win over GET /offers/:id
  controllers: [MatchingController, OffersController, ClaimsController, AnalyticsController],
  providers: [
    OffersService,
    ClaimsService,
    OfferExpiryService,
    MatchingService,
    CharityNeedsService,
    RatingsService,
    TrustService,
    AnalyticsService,
    MaintenanceProcessor,
    JobsBootstrap,
  ],
  exports: [OffersService, ClaimsService, OfferExpiryService],
})
export class OffersModule {}

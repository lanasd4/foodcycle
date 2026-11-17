import { Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { CurrentUser, RequireActiveOrg, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { Offer } from '../offers/offer.entities.js';
import { CharityNeedsService, charityNeedsSchema, type CharityNeedsInput } from './charity-needs.js';
import { MatchingService } from './matching.service.js';

/**
 * Registered before OffersController so that GET /offers/recommended is not
 * captured by GET /offers/:id.
 */
@ApiTags('matching')
@ApiBearerAuth()
@Controller()
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly needs: CharityNeedsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** Offers ranked for this charity by the Smart Matching score, each with its reasons. */
  @Get('offers/recommended')
  @Roles('CHARITY')
  @RequireActiveOrg()
  recommended(@CurrentUser() user: AuthUser) {
    return this.matching.offersForCharity(user.orgId!);
  }

  /** Charities best suited to this offer (donor of the offer, or admin). */
  @Get('offers/:id/matches')
  @Roles('DONOR', 'ADMIN')
  async matches(@CurrentUser() user: AuthUser, @Param('id', { schema: z.string().uuid() }) id: string) {
    const offer = await this.db.getRepository(Offer).findOneBy({ id });
    if (!offer || (user.role !== 'ADMIN' && offer.donorId !== user.orgId)) {
      throw new NotFoundException({ code: 'OFFER_NOT_FOUND' });
    }
    // the screen shows the best few; logging every candidate on each view would flood the suggestion log
    const items = (await this.matching.charitiesForOffer(this.db.manager, id)).slice(0, 20);
    const p = await this.matching.params();
    await this.matching.logSuggestions(
      this.db.manager,
      items.map((x) => ({ offerId: id, charityId: x.charityId, score: x.score, components: x.components })),
      p.weightsVersion,
      'DONOR_VIEW',
    );
    return { items, weightsVersion: p.weightsVersion };
  }

  @Get('charity-needs/me')
  @Roles('CHARITY')
  getNeeds(@CurrentUser() user: AuthUser) {
    return this.needs.get(user);
  }

  /** Allowed while pending verification, so the charity can prepare its profile. */
  @Put('charity-needs/me')
  @Roles('CHARITY')
  putNeeds(@CurrentUser() user: AuthUser, @Body({ schema: charityNeedsSchema }) body: CharityNeedsInput) {
    return this.needs.put(user, body);
  }
}

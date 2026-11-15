import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, RequireActiveOrg, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  browseOffersQuery,
  cancelOfferSchema,
  createOfferSchema,
  myOffersQuery,
  updateOfferSchema,
  type BrowseOffersQuery,
  type CancelOfferInput,
  type CreateOfferInput,
  type MyOffersQuery,
  type UpdateOfferInput,
} from './offers.schemas.js';
import { OffersService } from './offers.service.js';

const offerId = z.string().uuid();

@ApiTags('offers')
@ApiBearerAuth()
@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  /** Fixed list of food categories with their safety rules. */
  @Get('food-categories')
  categories() {
    return this.offers.categories();
  }

  // ---------- donor ----------

  @Post('offers')
  @Roles('DONOR')
  @RequireActiveOrg()
  create(@CurrentUser() user: AuthUser, @Body({ schema: createOfferSchema }) body: CreateOfferInput) {
    return this.offers.create(user, body);
  }

  @Get('offers/mine')
  @Roles('DONOR')
  mine(@CurrentUser() user: AuthUser, @Query({ schema: myOffersQuery }) q: MyOffersQuery) {
    return this.offers.mine(user, q);
  }

  @Patch('offers/:id')
  @Roles('DONOR')
  @RequireActiveOrg()
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: offerId }) id: string,
    @Body({ schema: updateOfferSchema }) body: UpdateOfferInput,
  ) {
    return this.offers.update(user, id, body);
  }

  /** A suspended donor can still cancel, so food is not left promised. */
  @Patch('offers/:id/cancel')
  @Roles('DONOR')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: offerId }) id: string,
    @Body({ schema: cancelOfferSchema }) body: CancelOfferInput,
  ) {
    return this.offers.cancel(user, id, body);
  }

  // ---------- charity ----------

  /** Expiry Priority list: most urgent first, with distance from the charity. */
  @Get('offers')
  @Roles('CHARITY')
  @RequireActiveOrg()
  browse(@CurrentUser() user: AuthUser, @Query({ schema: browseOffersQuery }) q: BrowseOffersQuery) {
    return this.offers.browse(user, q);
  }

  // ---------- shared ----------

  @Get('offers/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', { schema: offerId }) id: string) {
    return this.offers.getOne(user, id);
  }
}

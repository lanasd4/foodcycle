import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, RequireActiveOrg, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  confirmPickupSchema,
  createClaimSchema,
  listClaimsQuery,
  rejectClaimSchema,
  type ConfirmPickupInput,
  type CreateClaimInput,
  type ListClaimsQuery,
  type RejectClaimInput,
} from './claims.schemas.js';
import { ClaimsService } from './claims.service.js';

const uuid = z.string().uuid();

@ApiTags('claims')
@ApiBearerAuth()
@Controller()
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  // ---------- charity ----------

  /** Reserve a quantity of an offer (AUTO: reserved now, MANUAL: waits for the donor). */
  @Post('offers/:id/claims')
  @Roles('CHARITY')
  @RequireActiveOrg()
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: uuid }) offerId: string,
    @Body({ schema: createClaimSchema }) body: CreateClaimInput,
  ) {
    return this.claims.create(user, offerId, body);
  }

  @Get('claims/mine')
  @Roles('CHARITY')
  mine(@CurrentUser() user: AuthUser, @Query({ schema: listClaimsQuery }) q: ListClaimsQuery) {
    return this.claims.mine(user, q);
  }

  /** A suspended charity can still cancel, so the food goes back to others. */
  @Delete('claims/:id')
  @Roles('CHARITY')
  cancel(@CurrentUser() user: AuthUser, @Param('id', { schema: uuid }) id: string) {
    return this.claims.cancelByCharity(user, id);
  }

  // ---------- donor ----------

  @Get('claims/incoming')
  @Roles('DONOR')
  incoming(@CurrentUser() user: AuthUser, @Query({ schema: listClaimsQuery }) q: ListClaimsQuery) {
    return this.claims.incoming(user, q);
  }

  @Post('claims/confirm-pickup')
  @Roles('DONOR')
  @HttpCode(200)
  confirmPickup(@CurrentUser() user: AuthUser, @Body({ schema: confirmPickupSchema }) body: ConfirmPickupInput) {
    return this.claims.confirmPickup(user, body);
  }

  @Post('claims/:id/approve')
  @Roles('DONOR')
  @RequireActiveOrg()
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', { schema: uuid }) id: string) {
    return this.claims.approve(user, id);
  }

  /** Allowed even when suspended: rejecting gives the food back to others. */
  @Post('claims/:id/reject')
  @Roles('DONOR')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: uuid }) id: string,
    @Body({ schema: rejectClaimSchema }) body: RejectClaimInput,
  ) {
    return this.claims.reject(user, id, body);
  }

  // ---------- shared ----------

  @Get('claims/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', { schema: uuid }) id: string) {
    return this.claims.getOne(user, id);
  }
}

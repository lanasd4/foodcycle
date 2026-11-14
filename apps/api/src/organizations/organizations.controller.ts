import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  listOrgsQuery,
  updateSettingsSchema,
  verifySchema,
  type ListOrgsQuery,
  type UpdateSettingsInput,
  type VerifyInput,
} from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get('me')
  @Roles('DONOR', 'CHARITY')
  mine(@CurrentUser() user: AuthUser) {
    return this.orgs.getMine(user);
  }

  /** Allowed while pending verification, so donors can prepare their settings. */
  @Patch('me/settings')
  @Roles('DONOR')
  updateSettings(@CurrentUser() user: AuthUser, @Body({ schema: updateSettingsSchema }) body: UpdateSettingsInput) {
    return this.orgs.updateSettings(user, body);
  }

  @Get()
  @Roles('ADMIN')
  list(@Query({ schema: listOrgsQuery }) q: ListOrgsQuery) {
    return this.orgs.list(q);
  }

  @Patch(':id/verify')
  @Roles('ADMIN')
  verify(
    @CurrentUser() admin: AuthUser,
    @Param('id', { schema: z.string().uuid() }) id: string,
    @Body({ schema: verifySchema }) body: VerifyInput,
  ) {
    return this.orgs.setStatus(admin, id, body);
  }
}

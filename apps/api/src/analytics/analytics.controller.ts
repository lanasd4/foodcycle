import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AnalyticsService, periodQuery, topDonorsQuery, trendQuery, type Period } from './analytics.service.js';

/** Impact Analytics. Every endpoint takes an optional period: ?from=…&to=… (ISO, default last 30 days). */
@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @Roles('ADMIN')
  summary(@Query({ schema: periodQuery }) p: Period) {
    return this.analytics.summary(p);
  }

  @Get('top-donors')
  @Roles('ADMIN')
  topDonors(@Query({ schema: topDonorsQuery }) q: z.infer<typeof topDonorsQuery>) {
    return this.analytics.topDonors(q);
  }

  @Get('need-by-area')
  @Roles('ADMIN')
  needByArea(@Query({ schema: periodQuery }) p: Period) {
    return this.analytics.needByArea(p);
  }

  @Get('trend')
  @Roles('ADMIN')
  trend(@Query({ schema: trendQuery }) q: z.infer<typeof trendQuery>) {
    return this.analytics.trend(q);
  }

  /** Donors and charities: their own impact. */
  @Get('me')
  @Roles('DONOR', 'CHARITY')
  mine(@CurrentUser() user: AuthUser, @Query({ schema: periodQuery }) p: Period) {
    return this.analytics.mine(user, p);
  }
}

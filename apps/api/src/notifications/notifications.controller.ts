import { Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { listNotificationsQuery, NotificationsService, type ListNotificationsQuery } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Newest first. Works for every role (admins receive their own notifications). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query({ schema: listNotificationsQuery }) q: ListNotificationsQuery) {
    return this.notifications.list(user, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', { schema: z.string().regex(/^\d+$/) }) id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }
}

import { schemaResponse, schemaResponseArray } from '../api/response-schema';
import { auth } from '../auth/auth';
import { NotificationService } from './notification.service';
import {
  notificationPreferenceSchema,
  notificationPreferencesSchema,
  pushSubscriptionBodySchema,
  subscriptionStatusSchema,
  type NotificationPreferenceDto,
  type PushSubscriptionBodyDto,
  type SubscriptionStatusDto,
} from '@chaotic-next/shared-lib';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';

@ApiTags('notifications')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe the session user to push events' })
  @ApiCreatedResponse({
    description: 'Subscription successful.',
    schema: schemaResponse(z.object({ message: z.string().describe('Confirmation message') })).schema,
  })
  async subscribeToPushEvents(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: pushSubscriptionBodySchema }) body: PushSubscriptionBodyDto,
  ): Promise<{ message: string }> {
    return this.notificationService.subscribeToPushEvents(body, session.user.id);
  }

  @Get('subscriptions/me')
  @ApiOperation({ summary: 'Whether the session user has a live push subscription' })
  @ApiOkResponse({
    description: 'True when at least one subscription row exists for the session user.',
    schema: schemaResponse(subscriptionStatusSchema).schema,
  })
  getSubscriptionStatus(@Session() session: UserSession<typeof auth>): Promise<SubscriptionStatusDto> {
    return this.notificationService.hasSubscription(session.user.id).then((subscribed) => ({ subscribed }));
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Push notification preferences of the session user' })
  @ApiOkResponse({
    description: 'One entry per notification type; absent types are enabled.',
    schema: schemaResponseArray(notificationPreferenceSchema).schema,
  })
  getPreferences(@Session() session: UserSession<typeof auth>): Promise<NotificationPreferenceDto[]> {
    return this.notificationService.getPreferences(session.user.id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update push notification preferences of the session user' })
  @ApiOkResponse({ description: 'Preferences stored.' })
  setPreferences(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: notificationPreferencesSchema }) body: NotificationPreferenceDto[],
  ): Promise<void> {
    return this.notificationService.setPreferences(session.user.id, body);
  }
}

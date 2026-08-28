import { schemaResponse } from '../api/response-schema';
import { NotificationService } from './notification.service';
import { pushSubscriptionBodySchema, type PushSubscriptionBodyDto } from '@chaotic-next/shared-lib';
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';

@ApiTags('notifications')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to push events' })
  @ApiCreatedResponse({
    description: 'Subscription successful.',
    schema: schemaResponse(z.object({ message: z.string().describe('Confirmation message') })).schema,
  })
  async subscribeToPushEvents(
    @Body({ schema: pushSubscriptionBodySchema }) body: PushSubscriptionBodyDto,
  ): Promise<{ message: string }> {
    return this.notificationService.subscribeToPushEvents(body);
  }
}

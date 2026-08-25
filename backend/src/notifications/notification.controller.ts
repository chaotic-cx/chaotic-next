import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import type { PushSubscription } from 'web-push';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to push events' })
  @ApiBody({ type: Object, description: 'Subscription details' })
  @ApiCreatedResponse({ description: 'Subscription successful.', type: Object })
  async subscribeToPushEvents(@Body() body: PushSubscription) {
    return this.notificationService.subscribeToPushEvents(body);
  }
}

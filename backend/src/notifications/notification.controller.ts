import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PushSubscription } from 'web-push';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to push events' })
  @ApiBody({ type: Object, description: 'Subscription details' })
  @ApiCreatedResponse({ description: 'Subscription successful.' })
  async subscribeToPushEvents(@Body() body: PushSubscription) {
    return this.notificationService.subscribeToPushEvents(body);
  }
}

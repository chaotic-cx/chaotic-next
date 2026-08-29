import { NotificationPreference } from './notification-preference.entity';
import { NotificationSubscription } from './notification-subscription.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference, NotificationSubscription])],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService, TypeOrmModule],
})
export class NotificationsModule {}

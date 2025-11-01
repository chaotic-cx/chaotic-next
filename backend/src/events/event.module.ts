import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';

@Module({
  controllers: [EventController],
  exports: [EventService],
  imports: [],
  providers: [EventService],
})
export class EventModule {}

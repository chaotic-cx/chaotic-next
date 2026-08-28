import { EventController } from './event.controller';
import { EventService } from './event.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [EventController],
  exports: [EventService],
  imports: [],
  providers: [EventService],
})
export class EventModule {}

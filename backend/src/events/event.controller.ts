import { Controller, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventService } from './event.service';
import { Observable } from 'rxjs';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { ChaoticEvent } from '@./shared-lib';

@ApiTags('event')
@Controller()
export class EventController {
  constructor(private eventService: EventService) {}

  @AllowAnonymous()
  @Sse('sse')
  @ApiOperation({ summary: 'SSE endpoint for notifying clients about package and pipeline updates' })
  @ApiOkResponse({ description: 'Event stream containing ChaoticEvent type messages', type: Object })
  sse(): Observable<Partial<MessageEvent<ChaoticEvent>>> {
    return this.eventService.sseEvents$;
  }
}

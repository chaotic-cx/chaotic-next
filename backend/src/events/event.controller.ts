import { Controller, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventService } from './event.service';
import { merge, Observable, timer, map } from 'rxjs';
import { ChaoticEvent } from '@chaotic-next/shared-lib';

@ApiTags('event')
@Controller()
export class EventController {
  constructor(private eventService: EventService) {}

  @Sse('sse')
  @ApiOperation({ summary: 'SSE endpoint for notifying clients about package and pipeline updates' })
  @ApiOkResponse({ description: 'Event stream containing ChaoticEvent type messages', type: Object })
  sse(): Observable<Partial<MessageEvent<ChaoticEvent>>> {
    const heartbeat$ = timer(15000, 15000).pipe(
      map(() => ({ type: 'ping', data: { type: 'ping' } as unknown as ChaoticEvent })),
    );
    return merge(this.eventService.sseEvents$, heartbeat$);
  }
}

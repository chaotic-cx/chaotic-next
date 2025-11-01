import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ChaoticEvent } from '@./shared-lib';

@Injectable()
export class EventService {
  /**
   * Subject for notifying website users about certain events
   */
  public sseEvents$ = new Subject<Partial<MessageEvent<ChaoticEvent>>>();
}

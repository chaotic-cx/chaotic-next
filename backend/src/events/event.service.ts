import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ChaoticEvent } from '@chaotic-next/shared-lib';

@Injectable()
export class EventService {
  public sseEvents$ = new Subject<Partial<MessageEvent<ChaoticEvent>>>();
}

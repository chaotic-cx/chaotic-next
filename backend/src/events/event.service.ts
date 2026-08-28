import { ChaoticEvent } from '@chaotic-next/shared-lib';
import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class EventService {
  public sseEvents$ = new Subject<Partial<MessageEvent<ChaoticEvent>>>();
}

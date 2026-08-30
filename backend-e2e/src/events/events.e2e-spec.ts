import 'reflect-metadata';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { EventService } from '@chaotic-next/backend/events/event.service';
import type { ChaoticEvent } from '@chaotic-next/shared-lib';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('EventService SSE wiring (e2e, real PostgreSQL)', () => {
  let e2e: E2eApp;
  let eventService: EventService;

  beforeAll(async () => {
    e2e = await createE2eApp();
    eventService = e2e.app.get<EventService>(EventService);
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('exposes an RxJS Subject that delivers events to subscribers', async () => {
    const emittedEvent: Partial<MessageEvent<ChaoticEvent>> = {
      data: {
        type: 'build',
        package: 'firedragon',
        version: '2:13.1.1',
        pkgrel: 1,
        bump: 0,
        duration: 0,
        repo: 'garuda',
        status: 0,
      },
    };

    const promise = firstValueFrom(eventService.sseEvents$);
    eventService.sseEvents$.next(emittedEvent);

    const received = await promise;
    expect(received.data).toMatchObject({ type: 'build', package: 'firedragon' });
  });

  it('delivers pipeline events pushed by GitlabService to subscribers', async () => {
    const pipelineEvent: Partial<MessageEvent<ChaoticEvent>> = {
      data: { type: 'pipeline', pipeline: [] },
    };

    const promise = firstValueFrom(eventService.sseEvents$);
    eventService.sseEvents$.next(pipelineEvent);

    const received = await promise;
    expect(received.data).toMatchObject({ type: 'pipeline' });
  });

  it('delivers queue events pushed by the broker handler to subscribers', async () => {
    const queueEvent: Partial<MessageEvent<ChaoticEvent>> = {
      data: { type: 'queue', count: 5, labels: { build_class: [], pkgname: [], target_repo: [] } },
    };

    const promise = firstValueFrom(eventService.sseEvents$);
    eventService.sseEvents$.next(queueEvent);

    const received = await promise;
    expect(received.data).toMatchObject({ type: 'queue' });
  });
});

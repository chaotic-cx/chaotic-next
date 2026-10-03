import { ApplicationRef, Injector, runInInjectionContext } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { chartResource } from './chart-config';

const POINTS = [3, 5, 8];

let http: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  http = TestBed.inject(HttpTestingController);
});

// Each chart component has its own injector, which ends when the tab closes.
function mountChart(url: string) {
  const injector = Injector.create({ providers: [], parent: TestBed.inject(Injector) });
  return runInInjectionContext(injector, () => chartResource<number[]>(() => ({ url, params: { days: '7' } })));
}

async function settle(): Promise<void> {
  TestBed.tick();
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('chartResource', () => {
  it('loads with a skeleton the first time', async () => {
    const chart = mountChart('/first-visit');
    TestBed.tick();

    expect(chart.loading()).toBe(true);
    expect(chart.hasData()).toBe(false);

    http.expectOne('/first-visit?days=7').flush(POINTS);
    await settle();

    expect(chart.loading()).toBe(false);
    expect(chart.data()).toEqual(POINTS);
  });

  it('draws the cached response at once when the same chart mounts again', async () => {
    mountChart('/revisit');
    TestBed.tick();
    http.expectOne('/revisit?days=7').flush(POINTS);
    await settle();

    const revisited = mountChart('/revisit');
    TestBed.tick();

    expect(revisited.loading()).toBe(false);
    expect(revisited.hasData()).toBe(true);
    expect(revisited.data()).toEqual(POINTS);

    http.expectOne('/revisit?days=7').flush([13]);
    await settle();

    expect(revisited.data()).toEqual([13]);
  });

  it('keeps the cached response and reports the failure when the refresh fails', async () => {
    mountChart('/refresh-fails');
    TestBed.tick();
    http.expectOne('/refresh-fails?days=7').flush(POINTS);
    await settle();

    const revisited = mountChart('/refresh-fails');
    TestBed.tick();
    http.expectOne('/refresh-fails?days=7').flush('down', { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(revisited.failed()).toBe(true);
    expect(revisited.hasData()).toBe(true);
    expect(revisited.data()).toEqual(POINTS);
  });
});

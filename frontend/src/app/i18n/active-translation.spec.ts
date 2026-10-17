import { Injector, runInInjectionContext, Service } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideTransloco,
  provideTranslocoScope,
  type Translation,
  type TranslocoLoader,
  TranslocoService,
} from '@jsverse/transloco';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { injectActiveTranslation } from './active-translation';

@Service()
class StubLoader implements TranslocoLoader {
  getTranslation(): ReturnType<TranslocoLoader['getTranslation']> {
    const empty: Translation = {};
    return of(empty);
  }
}

function setUp(): TranslocoService {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { availableLangs: ['en', 'de'], defaultLang: 'en', scopes: { autoPrefixKeys: false } },
        loader: StubLoader,
      }),
    ],
  });

  return TestBed.inject(TranslocoService);
}

describe('injectActiveTranslation', () => {
  it('ignores scope loads that the caller does not provide', async () => {
    const transloco = setUp();
    const version = TestBed.runInInjectionContext(() => injectActiveTranslation());
    const before = version();

    await firstValueFrom(transloco.load('admin/en'));

    expect(version()).toBe(before);
  });

  it('changes when a scope of the caller loads', async () => {
    const transloco = setUp();
    const scopedInjector = Injector.create({
      providers: [provideTranslocoScope('admin')],
      parent: TestBed.inject(Injector),
    });
    const version = runInInjectionContext(scopedInjector, () => injectActiveTranslation());
    const before = version();

    await firstValueFrom(transloco.load('admin/en'));

    expect(version()).not.toBe(before);
  });

  it('changes on a real language switch only', () => {
    const transloco = setUp();
    const version = TestBed.runInInjectionContext(() => injectActiveTranslation());
    const before = version();

    transloco.setActiveLang('en');
    expect(version()).toBe(before);

    transloco.setActiveLang('de');
    expect(version()).not.toBe(before);
  });
});

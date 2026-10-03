import { Service } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import {
  provideTransloco,
  provideTranslocoScope,
  type Translation,
  type TranslocoLoader,
  TranslocoService,
} from '@jsverse/transloco';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { translationScopeResolver } from './translation-scope.resolver';

const TRANSLATIONS: Record<string, Translation> = {
  'en': { routes: { home: 'Home' } },
  'admin/en': { layout: { title: 'Admin' } },
  'privacy-policy/en': { 'seo.description': 'Flat key from the optimized build' },
};

@Service()
class StubLoader implements TranslocoLoader {
  getTranslation(path: string) {
    return of(TRANSLATIONS[path] ?? {});
  }
}

async function resolveWithScopes(scopes: string[], flattenAot: boolean): Promise<TranslocoService> {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: {
          availableLangs: ['en'],
          defaultLang: 'en',
          flatten: { aot: flattenAot },
          scopes: { autoPrefixKeys: false },
        },
        loader: StubLoader,
      }),
      provideTranslocoScope(...scopes),
    ],
  });

  const transloco = TestBed.inject(TranslocoService);
  await firstValueFrom(transloco.load('en'));

  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  await TestBed.runInInjectionContext(() => translationScopeResolver(route, state));

  return transloco;
}

describe('translationScopeResolver', () => {
  it('loads the route scope so full keys translate synchronously', async () => {
    const transloco = await resolveWithScopes(['admin'], false);

    expect(transloco.translate('admin.layout.title')).toBe('Admin');
    expect(transloco.translate('routes.home')).toBe('Home');
  });

  it('maps kebab-case scopes to their camelCase alias with flattened files', async () => {
    const transloco = await resolveWithScopes(['privacy-policy'], true);

    expect(transloco.translate('privacyPolicy.seo.description')).toBe('Flat key from the optimized build');
  });
});

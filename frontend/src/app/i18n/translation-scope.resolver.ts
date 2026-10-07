import { inject } from '@angular/core';
import { type ResolveFn } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { injectProvidedScopeNames } from './provided-scopes';

/**
 * Loads the translation scopes of the route before the route activates.
 * Synchronous `TranslocoService.translate` calls then never return a raw key.
 */
export const translationScopeResolver: ResolveFn<unknown> = () => {
  const transloco = inject(TranslocoService);
  const language = transloco.getActiveLang();
  const loads: Promise<unknown>[] = [];

  for (const scope of injectProvidedScopeNames()) {
    loads.push(firstValueFrom(transloco.load(`${scope}/${language}`)));
  }

  return Promise.all(loads);
};

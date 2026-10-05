import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type TranslocoEvents, TranslocoService } from '@jsverse/transloco';
import { distinctUntilChanged, filter, map, merge } from 'rxjs';
import { injectProvidedScopeNames } from './provided-scopes';

/**
 * Changes after a language switch, and after a translation file loads
 * that the caller reads: the global file or a scope of the caller's injector.
 * Other scope loads do not count, so menus do not rebuild their items for nothing.
 * Read it inside a `computed` that calls `TranslocoService.translate`.
 */
export function injectActiveTranslation(): Signal<number> {
  const transloco = inject(TranslocoService);
  const scopes = injectProvidedScopeNames();

  const isRelevantLoad = (event: TranslocoEvents): boolean => {
    if (event.type !== 'translationLoadSuccess') return false;

    const loadedScope = event.payload.scope;
    return loadedScope === null || scopes.includes(loadedScope);
  };

  // Every loaded scope file sets the same language again, so only real switches count.
  const languageSwitches = transloco.langChanges$.pipe(distinctUntilChanged());
  const relevantLoads = transloco.events$.pipe(filter(isRelevantLoad));
  const changes = merge(languageSwitches, relevantLoads).pipe(map((change, index) => index));

  return toSignal(changes, { initialValue: 0 });
}

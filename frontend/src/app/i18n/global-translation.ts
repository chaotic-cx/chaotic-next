import { computed, inject, type Signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { injectActiveTranslation } from './active-translation';

/**
 * A global translation key as a signal, also inside a scoped route such as `admin`.
 * `translateSignal` resolves keys in the injector's scope, so shared directives and pipes
 * would look up `admin.<key>` there and show the raw key.
 */
export function injectGlobalTranslation(key: string): Signal<string> {
  const transloco = inject(TranslocoService);
  const activeTranslation = injectActiveTranslation();

  return computed(() => {
    activeTranslation();
    return transloco.translate(key);
  });
}

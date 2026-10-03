import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Emits the active language code.
 * Impure pipes read it in `transform`, so the view refreshes after a language change.
 */
export function injectActiveLanguage(): Signal<string> {
  const transloco = inject(TranslocoService);

  return toSignal(transloco.langChanges$, { initialValue: transloco.getActiveLang() });
}

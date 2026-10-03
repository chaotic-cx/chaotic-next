import { DestroyRef, effect, inject, Service, signal, type Signal } from '@angular/core';

/**
 * Name of the record that a detail page shows, for example a package name.
 * The title strategy puts it in front of the route title.
 */
@Service()
export class RecordTitleService {
  readonly name = signal<string | undefined>(undefined);
}

/**
 * Keeps the document title in sync with the record of a detail page.
 * The record name goes away when the page is destroyed.
 * Must run in an injection context.
 */
export function bindRecordTitle(source: Signal<string | undefined>): void {
  const recordTitle = inject(RecordTitleService);

  effect(() => {
    recordTitle.name.set(source());
  });

  inject(DestroyRef).onDestroy(() => recordTitle.name.set(undefined));
}

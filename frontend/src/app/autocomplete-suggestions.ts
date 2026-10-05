import { httpResource, type HttpResourceRequest } from '@angular/common/http';
import { computed, linkedSignal, type Signal, signal } from '@angular/core';
import { type AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';

export interface SuggestionsOptions<T> {
  minLength: number;
  request: (query: string) => HttpResourceRequest | undefined;
  toNames: (response: T) => string[];
}

export interface Suggestions {
  readonly names: Signal<string[]>;
  complete(event: AutoCompleteCompleteEvent): void;
  clear(): void;
}

/**
 * Autocomplete suggestions loaded through httpResource.
 * The names keep their last value while a request runs, so the overlay changes only when a response arrives.
 * A failed request shows no suggestions.
 */
export function createSuggestions<T>(options: SuggestionsOptions<T>): Suggestions {
  // The autocomplete spinner stops only when the names emit, so every complete event must trigger a request.
  const query = signal('', { equal: () => false });
  const resource = httpResource<T>(() => {
    const term = query();
    return term.length < options.minLength ? undefined : options.request(term);
  });
  const settledNames = computed(() => {
    if (query().length < options.minLength) return [];
    if (resource.isLoading()) return undefined;

    return resource.hasValue() ? options.toNames(resource.value()) : [];
  });
  const names = linkedSignal<string[] | undefined, string[]>({
    source: settledNames,
    computation: (next, previous) => next ?? previous?.value ?? [],
  });

  return {
    names,
    complete: (event) => query.set(event.query.trim()),
    clear: () => query.set(''),
  };
}

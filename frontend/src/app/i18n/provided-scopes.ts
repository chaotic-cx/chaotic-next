import { inject } from '@angular/core';
import { TRANSLOCO_SCOPE, type TranslocoScope } from '@jsverse/transloco';

function scopeName(scope: TranslocoScope): string | undefined {
  if (typeof scope === 'string') return scope;

  return scope?.scope;
}

/**
 * Names of the translation scopes that the current injector provides, e.g. `admin`.
 * `provideTranslocoScope` registers `TRANSLOCO_SCOPE` as a multi provider,
 * but the token type does not show that, so a single value is accepted too.
 */
export function injectProvidedScopeNames(): string[] {
  const provided: TranslocoScope | TranslocoScope[] | null = inject(TRANSLOCO_SCOPE, { optional: true });
  if (provided === null) return [];

  let scopes: TranslocoScope[] = [provided];
  if (Array.isArray(provided)) {
    scopes = provided;
  }

  const names: string[] = [];
  for (const scope of scopes) {
    const name = scopeName(scope);
    if (name !== undefined) {
      names.push(name);
    }
  }

  return names;
}

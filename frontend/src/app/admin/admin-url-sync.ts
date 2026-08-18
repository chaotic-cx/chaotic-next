import { ActivatedRoute, Router } from '@angular/router';

export type QueryParamSetter = (raw: string | null) => void;

export type QueryParamPatch = Record<string, string | null | undefined>;

export function restoreQueryParams(route: ActivatedRoute, setters: Record<string, QueryParamSetter>): void {
  const params = route.snapshot.queryParamMap;
  for (const [name, apply] of Object.entries(setters)) {
    apply(params.get(name));
  }
}

export function patchQueryParams(router: Router, route: ActivatedRoute, patch: QueryParamPatch): void {
  void router.navigate([], {
    relativeTo: route,
    queryParams: patch,
    queryParamsHandling: 'merge',
    info: { disableViewTransition: true },
  });
}

export function pageFromQuery(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function pageToQuery(page: number): string | null {
  return page === 1 ? null : String(page);
}

export function stringFilterFromQuery(raw: string | null): string | undefined {
  return raw === null || raw === '' ? undefined : raw;
}

export function stringFilterToQuery(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

export function queryFromRaw(raw: string | null): string {
  return raw ?? '';
}

export function queryToQuery(query: string): string | null {
  return query === '' ? null : query;
}

export function createDebounced(delay: number, fn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

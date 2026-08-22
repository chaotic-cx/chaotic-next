import { ActivatedRoute, Router } from '@angular/router';
import { signal, type WritableSignal } from '@angular/core';

export type QueryParamSetter = (raw: string | null) => void;

export type QueryParamPatch = Record<string, string | null | undefined>;

const DEFAULT_PER_PAGE = 25;

export interface AdminPagination {
  page: WritableSignal<number>;
  perPage: WritableSignal<number>;
  handleLazyLoad(event: { first?: number; rows?: number | null }): void;
  restoreFromQuery(route: ActivatedRoute): void;
  resetPage(): void;
}

export function createAdminPagination(opts: {
  router: Router;
  route: ActivatedRoute;
  defaultPerPage?: number;
}): AdminPagination {
  const { router, route, defaultPerPage = DEFAULT_PER_PAGE } = opts;
  const page = signal(1);
  const perPage = signal(defaultPerPage);

  return {
    page,
    perPage,
    handleLazyLoad(event) {
      const rows = event.rows ?? defaultPerPage;
      page.set(Math.floor((event.first ?? 0) / rows) + 1);
      perPage.set(rows);
      patchQueryParams(router, route, {
        page: pageToQuery(page()),
        perPage: perPageToQuery(perPage(), defaultPerPage),
      });
    },
    restoreFromQuery(route) {
      const params = route.snapshot.queryParamMap;
      page.set(pageFromQuery(params.get('page')));
      perPage.set(perPageFromQuery(params.get('perPage'), defaultPerPage));
    },
    resetPage() {
      page.set(1);
    },
  };
}

export function perPageFromQuery(raw: string | null, defaultValue = DEFAULT_PER_PAGE): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

export function perPageToQuery(value: number, defaultValue = DEFAULT_PER_PAGE): string | null {
  return value === defaultValue ? null : String(value);
}

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

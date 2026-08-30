import { ActivatedRoute, Router } from '@angular/router';
import { createLazyTablePagination, DEFAULT_PER_PAGE, type LazyTablePagination } from '../table-pagination';

export type QueryParamSetter = (raw: string | null) => void;

export type QueryParamPatch = Record<string, string | null | undefined>;

export interface StatefulTableRef {
  first: number | null | undefined;
}

export interface AdminPagination extends LazyTablePagination {
  restoreFromQuery(route: ActivatedRoute): void;
  handleStatefulLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void;
}

export function createAdminPagination(opts: {
  router: Router;
  route: ActivatedRoute;
  defaultPerPage?: number;
}): AdminPagination {
  const { router, route, defaultPerPage = DEFAULT_PER_PAGE } = opts;
  const pagination = createLazyTablePagination(defaultPerPage);
  let statePageReconciled = false;

  return {
    page: pagination.page,
    perPage: pagination.perPage,
    handleLazyLoad(event) {
      pagination.handleLazyLoad(event);
      patchQueryParams(router, route, {
        page: pageToQuery(pagination.page()),
        perPage: perPageToQuery(pagination.perPage(), defaultPerPage),
      });
    },
    handleStatefulLazyLoad(table, event) {
      const expectedFirst = (pagination.page() - 1) * pagination.perPage();
      const first = statePageReconciled ? (event.first ?? 0) : expectedFirst;
      statePageReconciled = true;
      table.first = first;
      this.handleLazyLoad({ ...event, first });
    },
    restoreFromQuery(route) {
      const params = route.snapshot.queryParamMap;
      pagination.page.set(pageFromQuery(params.get('page')));
      pagination.perPage.set(perPageFromQuery(params.get('perPage'), defaultPerPage));
    },
    resetPage() {
      pagination.resetPage();
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

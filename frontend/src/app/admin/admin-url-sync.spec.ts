import { ActivatedRoute, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminPagination } from './admin-url-sync';

function createPagination(routeData: Record<string, string | null> = {}) {
  const router = { navigate: vi.fn() } as unknown as Router;
  const route = {
    snapshot: {
      queryParamMap: {
        get: (name: string) => routeData[name] ?? null,
      },
    },
  } as unknown as ActivatedRoute;
  return { pagination: createAdminPagination({ router, route }), navigate: router.navigate };
}

describe('createAdminPagination', () => {
  let table: { first: number };

  beforeEach(() => {
    table = { first: 0 };
  });

  it('keeps the URL page authoritative over a restored table offset', () => {
    const { pagination } = createPagination();
    pagination.restoreFromQuery({ snapshot: { queryParamMap: { get: () => null } } } as unknown as ActivatedRoute);
    table.first = 200;
    pagination.handleStatefulLazyLoad(table, { first: 200, rows: 25 });
    expect(pagination.page()).toBe(1);
    expect(table.first).toBe(0);
  });

  it('derives the expected offset from a URL page param on the first event', () => {
    const { pagination } = createPagination();
    const restoreRoute = {
      snapshot: { queryParamMap: { get: (name: string) => (name === 'page' ? '3' : null) } },
    } as unknown as ActivatedRoute;
    pagination.restoreFromQuery(restoreRoute);
    table.first = 0;
    pagination.handleStatefulLazyLoad(table, { first: 0, rows: 25 });
    expect(pagination.page()).toBe(3);
    expect(table.first).toBe(50);
  });

  it('trusts later events after the first reconciliation', () => {
    const { pagination } = createPagination();
    pagination.handleStatefulLazyLoad(table, { first: 0, rows: 25 });
    pagination.handleStatefulLazyLoad(table, { first: 75, rows: 25 });
    expect(pagination.page()).toBe(4);
    expect(pagination.perPage()).toBe(25);
    expect(table.first).toBe(75);
  });

  it('adopts a changed page size from the event while reconciling', () => {
    const { pagination } = createPagination();
    pagination.handleStatefulLazyLoad(table, { first: 100, rows: 100 });
    expect(pagination.page()).toBe(1);
    expect(pagination.perPage()).toBe(100);
    expect(table.first).toBe(0);
  });

  it('patches page and perPage into the query params on lazy load', () => {
    const { pagination, navigate } = createPagination();
    pagination.handleLazyLoad({ first: 25, rows: 25 });
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { page: '2', perPage: null } }));
  });

  it('restores page and perPage from query params', () => {
    const { pagination } = createPagination({ page: '2', perPage: '50' });
    pagination.restoreFromQuery({
      snapshot: {
        queryParamMap: {
          get: (name: string) => (name === 'page' ? '2' : name === 'perPage' ? '50' : null),
        },
      },
    } as unknown as ActivatedRoute);
    expect(pagination.page()).toBe(2);
    expect(pagination.perPage()).toBe(50);
  });
});

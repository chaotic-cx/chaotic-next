import { clampInt } from './functions';
import { type Paginated } from '@chaotic-next/shared-lib';

export const MAX_PER_PAGE = 200;
export const MAX_PAGE = 1_000_000;

/** Parsed and clamped pagination parameters for a request. */
export interface PaginationParams {
  page: number;
  perPage: number;
  /** Number of rows to skip, derived from page/perPage. */
  skip: number;
}

export function resolvePagination(page?: number, perPage?: number): PaginationParams {
  const safePage = clampInt(page ?? 1, 1, MAX_PAGE);
  const safePerPage = clampInt(perPage ?? 25, 1, MAX_PER_PAGE);
  return { page: safePage, perPage: safePerPage, skip: (safePage - 1) * safePerPage };
}

export function resolveOrder(order?: string): 'ASC' | 'DESC' {
  return order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

export function paginate<T>(items: T[], total: number, page: number, perPage: number): Paginated<T> {
  return { items, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

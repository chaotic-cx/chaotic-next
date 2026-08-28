import type { z } from 'zod';

export type QueryParamValue = string | number | boolean;
export type QueryParams = Record<string, QueryParamValue | QueryParamValue[]>;

/**
 * Parses a request object through a shared API schema, guaranteeing that the
 * frontend sends exactly the contract the backend validates. Undefined and null
 * values are dropped; arrays stay arrays so HttpParams repeats the key per item.
 */
export function parseQueryParams<T extends z.ZodType>(schema: T, value: unknown): QueryParams {
  const parsed = schema.parse(value) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(parsed)
      .filter((entry): entry is [string, QueryParamValue | QueryParamValue[]] => {
        const entryValue = entry[1];
        if (entryValue === undefined || entryValue === null) return false;
        return !Array.isArray(entryValue) || entryValue.length > 0;
      })
      .map(([key, entryValue]) => [
        key,
        Array.isArray(entryValue) ? entryValue.map((item) => String(item)) : String(entryValue),
      ]),
  );
}

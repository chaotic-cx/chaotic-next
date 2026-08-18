import { vi } from 'vitest';
import type {
  Repository,
  FindOptionsWhere,
  FindOptionsSelect,
  FindManyOptions,
  FindOneOptions,
  DeepPartial,
} from 'typeorm';

interface FindOperatorShape {
  _type: string;
  _value: unknown;
}

function isFindOperator(value: unknown): value is FindOperatorShape {
  return typeof value === 'object' && value !== null && '_type' in value && '_value' in value;
}

function valueMatches(entityValue: unknown, criterion: unknown): boolean {
  if (isFindOperator(criterion)) {
    if (criterion._type === 'in') return Array.isArray(criterion._value) && criterion._value.includes(entityValue);
    if (criterion._type === 'not') {
      if (isFindOperator(criterion._value)) return !valueMatches(entityValue, criterion._value);
      return entityValue !== criterion._value;
    }
    return false;
  }
  if (criterion && typeof criterion === 'object') {
    return Object.entries(criterion).every(([k, v]) => valueMatches((entityValue as Record<string, unknown>)?.[k], v));
  }
  return entityValue === criterion;
}

function matches<T>(entity: T, where: FindOptionsWhere<T> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => valueMatches((entity as Record<string, unknown>)[key], value));
}

function toComparable(value: unknown): string | number {
  return typeof value === 'number' ? value : String(value);
}

function selectFields<T>(entity: T, select: FindOptionsSelect<T> | undefined): T {
  if (!select) return entity;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(select)) result[key] = (entity as Record<string, unknown>)[key];
  return result as T;
}

interface MockRepositoryOptions<T> {
  keyOf: (entity: T) => string;
}

export interface MockRepository<T extends object> extends Repository<T> {
  store: Map<string, T>;
  seed: (entities: DeepPartial<T>[]) => void;
}

const FIND_OPTIONS_KEYS = new Set(['where', 'select', 'order', 'take', 'skip', 'relations']);

function isFindOptions<T>(value: unknown): value is FindManyOptions<T> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.keys(value).some((k) => FIND_OPTIONS_KEYS.has(k));
}

export function createMockRepository<T extends object>(opts: MockRepositoryOptions<T>): MockRepository<T> {
  const store = new Map<string, T>();
  const wrapped = {
    async find(optionsOrWhere?: FindManyOptions<T> | FindOptionsWhere<T>): Promise<T[]> {
      const isOpts = isFindOptions<T>(optionsOrWhere);
      const options = isOpts ? (optionsOrWhere as FindManyOptions<T>) : undefined;
      const where = (options?.where ?? (!isOpts ? optionsOrWhere : undefined)) as FindOptionsWhere<T> | undefined;
      const select = options?.select as FindOptionsSelect<T> | undefined;
      const results = Array.from(store.values()).filter((e) => matches(e, where));
      const order = options?.order as Record<string, 'ASC' | 'DESC'> | undefined;
      if (order) {
        for (const [key, dir] of Object.entries(order)) {
          results.sort((a, b) => {
            const av = toComparable((a as Record<string, unknown>)[key]);
            const bv = toComparable((b as Record<string, unknown>)[key]);
            if (av === bv) return 0;
            return dir === 'ASC' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
          });
        }
      }
      return results.map((e) => selectFields({ ...e }, select));
    },
    async findOne(options?: FindOneOptions<T>): Promise<T | null> {
      const where = options?.where as FindOptionsWhere<T> | undefined;
      const select = options?.select as FindOptionsSelect<T> | undefined;
      for (const entity of store.values()) {
        if (matches(entity, where)) return select ? selectFields({ ...entity }, select) : { ...entity };
      }
      return null;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match Repository.upsert
    async upsert(entities: T | T[], conflictPaths?: string[]): Promise<unknown> {
      const list = Array.isArray(entities) ? entities : [entities];
      const out: T[] = [];
      for (const entity of list) {
        const key = opts.keyOf(entity);
        const merged = { ...store.get(key), ...entity } as T;
        store.set(key, merged);
        out.push(merged);
      }
      return Array.isArray(entities) ? out : out[0];
    },
    async update(criteria: FindOptionsWhere<T>, partial: DeepPartial<T>): Promise<void> {
      for (const [key, entity] of store) {
        if (matches(entity, criteria)) store.set(key, { ...entity, ...partial } as T);
      }
    },
    async save(entities: T | T[]): Promise<unknown> {
      const list = Array.isArray(entities) ? entities : [entities];
      const out: T[] = [];
      for (const entity of list) {
        const key = opts.keyOf(entity);
        const merged = { ...store.get(key), ...entity } as T;
        store.set(key, merged);
        out.push(merged);
      }
      return Array.isArray(entities) ? out : out[0];
    },
    async delete(criteria: FindOptionsWhere<T>): Promise<void> {
      for (const [key, entity] of store) {
        if (matches(entity, criteria)) store.delete(key);
      }
    },
    async clear(): Promise<void> {
      store.clear();
    },
  };

  const api = {
    store,
    seed(entities: DeepPartial<T>[]): void {
      for (const e of entities) store.set(opts.keyOf(e as T), { ...e } as T);
    },
    find: vi.fn(wrapped.find),
    findOne: vi.fn(wrapped.findOne),
    findBy: vi.fn((where: FindOptionsWhere<T>) => wrapped.find(where)),
    upsert: vi.fn(wrapped.upsert),
    update: vi.fn(wrapped.update),
    save: vi.fn(wrapped.save),
    delete: vi.fn(wrapped.delete),
    clear: vi.fn(wrapped.clear),
  };

  return api as unknown as MockRepository<T>;
}

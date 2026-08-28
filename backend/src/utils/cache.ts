import { type Cache } from 'cache-manager';

/**
 * Returns a cached value, computing and storing it (with an explicit TTL) on a miss.
 */
export async function cachedResult<T>(cache: Cache, key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  await cache.set(key, value, ttlMs);
  return value;
}

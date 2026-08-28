import { type CacheManagerOptions, CacheModule } from '@nestjs/cache-manager';
import { KeyvCacheableMemory } from 'cacheable';
import Keyv from 'keyv';

const CACHE_NAMESPACE = 'nestjs-cache';
const LRU_MAX_ENTRIES = 1000;

export function lruCacheModule() {
  return CacheModule.registerAsync({
    isGlobal: true,
    useFactory: (): CacheManagerOptions => ({
      stores: [
        new Keyv({
          namespace: CACHE_NAMESPACE,
          store: new KeyvCacheableMemory({ lruSize: LRU_MAX_ENTRIES, namespace: CACHE_NAMESPACE }),
        }),
      ],
    }),
  });
}

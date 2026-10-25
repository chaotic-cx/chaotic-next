import { type CacheManagerOptions, CacheModule } from '@nestjs/cache-manager';
import { KeyvCacheableMemory } from 'cacheable';
import Keyv from 'keyv';

const LRU_MAX_ENTRIES = 1000;

export function lruCacheModule() {
  return CacheModule.registerAsync({
    isGlobal: true,
    useFactory: (): CacheManagerOptions => ({
      stores: [
        new Keyv({
          store: new KeyvCacheableMemory({ lruSize: LRU_MAX_ENTRIES }),
        }),
      ],
    }),
  });
}

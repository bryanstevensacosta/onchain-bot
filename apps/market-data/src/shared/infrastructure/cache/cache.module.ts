import { Global, Module } from '@nestjs/common';
import { CachePort } from './domain/cache.port';
import { InMemoryCacheAdapter } from './infrastructure/in-memory-cache.adapter';
import { CacheService } from './application/cache.service';
import { CacheInterceptor } from './infrastructure/cache.interceptor';

/**
 * CacheModule (Tramo 3, todo 2, SLO layer; hexagonal layout todo 12, P50).
 *
 * Global: CachePort (v1 in-memory; Redis swaps in via REDIS_URL without
 * changing consumers) + CacheService + CacheInterceptor. Edge caching
 * is applied per-endpoint in src/gateway/ via @UseInterceptors.
 */
@Global()
@Module({
  providers: [
    InMemoryCacheAdapter,
    CacheService,
    CacheInterceptor,
    { provide: CachePort, useExisting: InMemoryCacheAdapter },
  ],
  exports: [CachePort, CacheService, CacheInterceptor],
})
export class CacheModule {}

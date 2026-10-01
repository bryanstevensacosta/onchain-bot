import { SetMetadata } from '@nestjs/common';

/**
 * CacheTTL (Tramo 3, todo 2).
 *
 * Marks a gateway GET handler cacheable for N seconds. Read by the
 * CacheInterceptor; handlers without it use the interceptor default.
 */
export const CACHE_TTL_KEY = 'cache_ttl_seconds';

export const CacheTTL = (seconds: number): MethodDecorator & ClassDecorator =>
  SetMetadata(CACHE_TTL_KEY, seconds);

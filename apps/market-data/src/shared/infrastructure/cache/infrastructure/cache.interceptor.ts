import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map, of, tap } from 'rxjs';
import { CacheService } from '../application/cache.service';
import { CACHE_TTL_KEY } from './cache-ttl.decorator';

const DEFAULT_TTL_SECONDS = 30;

/**
 * CacheInterceptor (Tramo 3, todo 2, SLO layer).
 *
 * Caches GET responses under `GET:<url>` for the @CacheTTL window
 * (default 30s). Emits `x-cache: HIT|MISS` so edge caching is
 * observable in tests and manual QA. Only caches 2xx object bodies.
 *
 * Robust-nulls (plan todo 19a): bodies with `status: 'pending'` are
 * NEVER written — caching a pending shell freezes a transient miss
 * for the full TTL (P12: `x-cache: HIT`, zero provider traffic).
 * Ready bodies are cached exactly as before.
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  public constructor(
    private readonly cache: CacheService,
    private readonly reflector: Reflector,
  ) {}

  public async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; url: string }>();
    const response = context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
      statusCode: number;
    }>();
    if (request?.method !== 'GET') {
      return next.handle();
    }
    const ttl =
      this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_TTL_SECONDS;
    const key = `GET:${request.url}`;
    const cached = await this.cache.get<unknown>(key);
    if (cached !== null) {
      response.setHeader('x-cache', 'HIT');
      return of(cached);
    }
    response.setHeader('x-cache', 'MISS');
    return next.handle().pipe(
      tap((body) => {
        if (
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          body !== undefined &&
          !isPendingBody(body)
        ) {
          void this.cache.set(key, body, ttl);
        }
      }),
      map((body) => body),
    );
  }
}

/**
 * Pending-shell guard: a market-data snapshot (or batch item) whose
 * `status` is `'pending'` carries zero provider data — writing it
 * would serve a transient miss as a hit for the whole TTL.
 */
function isPendingBody(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const record = body as Record<string, unknown>;
  const status: unknown = record['status'];
  return status === 'pending';
}

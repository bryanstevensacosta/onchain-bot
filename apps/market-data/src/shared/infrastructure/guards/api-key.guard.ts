import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_KEY_HEADER, isAuthorized } from '../../domain/api-key';
import { REQUIRED_SCOPE_KEY } from 'auth/application/require-scope.decorator';
import { AccessAuditService } from 'auth/application/access-audit.service';
import { ApiKeyRateLimiter } from 'auth/application/api-key-rate-limiter';
import { ApiKeyService } from 'auth/application/api-key.service';
import { satisfiesScope, type ApiKeyScope } from 'auth/domain/api-key-scope';

export const API_KEY_INJECTION_TOKEN = 'MARKET_DATA_API_KEY';

interface GuardRequest {
  headers?: Record<string, unknown>;
  method?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  authKey?: { id: string; name: string; scopes: ReadonlyArray<ApiKeyScope> };
}

/**
 * Inbound auth guard (Tramo 3, todos 1 + 10, P46 seguridad).
 *
 * Resolution order per request:
 * 1. `@Public()` routes (health) always pass.
 * 2. Scoped store keys (`ApiKeyService`, admin endpoint managed):
 *    hash-verify -> scope check (403) -> per-key rate-limit (429).
 * 3. Legacy `MARKET_DATA_API_KEY` env key (admin-equivalent, pre-P46
 *    consumers): exact match passes with the required scope.
 * 4. Fail-open ONLY when no auth is configured at all (env empty AND
 *    store empty — keyless dev). Otherwise 401.
 *
 * Audit: every decision is recorded (who/when/endpoint/status) with
 * key ids only — key material, hashes, and query strings never enter
 * the audit log, application logs, responses, or errors.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly limiter: ApiKeyRateLimiter;

  public constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly keys?: ApiKeyService,
    @Optional() private readonly audit?: AccessAuditService,
    @Optional() keyLimiter?: ApiKeyRateLimiter,
  ) {
    this.limiter = keyLimiter ?? new ApiKeyRateLimiter();
  }

  public canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const required =
      this.reflector.getAllAndOverride<ApiKeyScope>(REQUIRED_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';
    const request = context.switchToHttp().getRequest<GuardRequest>();
    const provided = request?.headers?.[API_KEY_HEADER];
    const presented = typeof provided === 'string' ? provided : undefined;
    const method = (request?.method ?? 'GET').toUpperCase();
    const rawPath =
      request?.path ?? request?.originalUrl ?? request?.url ?? '/';
    const path = rawPath.split('?')[0] ?? '/';

    const stored = presented ? this.keys?.verify(presented) ?? null : null;
    if (stored) {
      if (!satisfiesScope(stored.scopes, required)) {
        this.audit?.record({ keyId: stored.id, keyName: stored.name, method, path, status: 403 });
        throw new ForbiddenException('Insufficient scope for this endpoint');
      }
      const limiter = this.limiter;
      if (!limiter.tryAcquire(stored.id, stored.rateLimitPerMin)) {
        this.audit?.record({ keyId: stored.id, keyName: stored.name, method, path, status: 429 });
        throw new HttpException('Rate limit exceeded for this key', HttpStatus.TOO_MANY_REQUESTS);
      }
      request.authKey = { id: stored.id, name: stored.name, scopes: stored.scopes };
      this.audit?.record({ keyId: stored.id, keyName: stored.name, method, path, status: 200 });
      return true;
    }

    const expected = (process.env.MARKET_DATA_API_KEY ?? '').trim();
    if (expected !== '' && isAuthorized(provided, expected)) {
      this.audit?.record({ keyId: 'env', keyName: 'MARKET_DATA_API_KEY', method, path, status: 200 });
      return true;
    }

    const storeEmpty = (this.keys?.list().length ?? 0) === 0;
    if (expected === '' && storeEmpty) {
      return true;
    }
    this.audit?.record({ keyId: 'anonymous', keyName: 'anonymous', method, path, status: 401 });
    throw new UnauthorizedException('Invalid or missing API key');
  }
}

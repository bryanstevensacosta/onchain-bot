import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_KEY_HEADER, isAuthorized } from '../../domain/api-key';
import { REQUIRED_SCOPE_KEY } from 'auth/application/require-scope.decorator';
import { AccessAuditService } from 'auth/application/access-audit.service';
import { ApiKeyRateLimiter } from 'auth/application/api-key-rate-limiter';
import { ApiKeyService } from 'auth/application/api-key.service';
import { satisfiesScope, type ApiKeyScope } from 'auth/domain/api-key-scope';

interface GuardRequest {
  headers?: Record<string, unknown>;
  method?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  authKey?: { id: string; name: string; scopes: ReadonlyArray<ApiKeyScope> };
}

/**
 * Inbound auth guard (ai-ml, todo 0).
 *
 * Resolution order per request:
 * 1. `@Public()` routes (health) always pass.
 * 2. Scoped store keys (`ApiKeyService`, admin endpoint managed):
 *    hash-verify -> scope check (403) -> per-key rate-limit (429).
 * 3. Legacy `AI_ML_API_KEY` env key (admin-equivalent, pre-store
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
    private readonly config: ConfigService,
    @Optional() private readonly keys?: ApiKeyService,
    @Optional() private readonly audit?: AccessAuditService,
    @Optional() keyLimiter?: ApiKeyRateLimiter,
  ) {
    this.limiter = keyLimiter ?? new ApiKeyRateLimiter();
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const rawPath = request?.path ?? request?.originalUrl ?? request?.url ?? '/';
    const path = rawPath.split('?')[0] ?? '/';
    const audit = (keyId: string, status: number): void => {
      this.audit?.record({ keyId, method, path, status });
    };

    if (presented && this.keys) {
      let record = null;
      try {
        record = await this.keys.verify(presented);
      } catch {
        record = null;
      }
      if (record) {
        if (!satisfiesScope(record.scopes, required)) {
          audit(record.id, 403);
          throw new ForbiddenException('Insufficient scope');
        }
        const budgetKey = `key:${record.id}`;
        if (!this.limiter.consume(budgetKey, record.rateLimitPerMin)) {
          audit(record.id, 429);
          throw new ForbiddenException('Rate limit exceeded');
        }
        if (request) {
          request.authKey = { id: record.id, name: record.name, scopes: record.scopes };
        }
        audit(record.id, 200);
        return true;
      }
    }

    const envKey = this.config.get<string>('AI_ML_API_KEY', '');
    if (presented && isAuthorized(presented, envKey)) {
      const budgetKey = 'key:env';
      if (!this.limiter.consume(budgetKey)) {
        audit('env', 429);
        throw new ForbiddenException('Rate limit exceeded');
      }
      if (request) {
        request.authKey = { id: 'env', name: 'env', scopes: ['admin'] };
      }
      audit('env', 200);
      return true;
    }

    const storeEmpty = !this.keys || this.keys.count() === 0;
    if (!envKey && storeEmpty) {
      audit('anonymous', 200);
      return true;
    }
    audit('anonymous', 401);
    throw new UnauthorizedException('Missing or invalid x-api-key');
  }
}

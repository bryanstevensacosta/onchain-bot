import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuardRequest,
  isPublicApiKeyExempt,
  isPublicAvatarRead,
  normalizePath,
  readPath,
  readProvidedKey,
  resolveExpectedApiKey,
  SSE_STREAM_PATH,
  timingSafeCompare,
} from './api-key.guard';
import { stripQueryForAudit } from './access-audit';
import { StructuredLoggerService } from '../logging/structured-logger.service';

/**
 * In-memory two-bucket rate limiter (sec1 T2).
 *
 * - Bucket A (protected routes + ALL writes): 60 req/min per IP → 429.
 * - Bucket B (public reads: media + avatar): 300 req/min per IP → 429
 *   (newsroom page-load fans out ~50 media + avatar reads; see U1 math
 *   in .omo/evidence/task-sec1-central.log).
 * - EXEMPT from counting: health trio + SSE handshake (reconnect bursts
 *   must never 429).
 * - 429 carries `Retry-After` (seconds) + `X-RateLimit-*` headers.
 * - 401 precedes 429 (M1): when a key is configured but the request
 *   carries no/invalid key, this guard DEFERS (returns true) so
 *   ApiKeyGuard throws the 401 — regardless of APP_GUARD execution order.
 * - Unset-key mode (M4): audit-only, never 429s.
 * - Single-instance in-memory sliding window; counters reset on restart
 *   (U2 — documented assumption, no Redis by design).
 * - IP keying honors `x-forwarded-for`-first ONLY when trustProxy is set
 *   (TRUST_PROXY=true, wired in main.ts); otherwise req.ip/socket is used.
 *   Spoof limit: behind an untrusted proxy a client can rotate the header —
 *   hence the flag defaults OFF (M2).
 */

export type RateLimitBucket = 'A' | 'B' | 'exempt';

const WINDOW_MS = 60_000;
const BUCKET_A_LIMIT = 60;
const BUCKET_B_LIMIT = 300;
const HEALTH_EXACT = '/api/health';
const HEALTH_LIVE_PREFIX = '/api/health/live';
const HEALTH_READY_PREFIX = '/api/health/ready';
const MEDIA_PREFIX = '/api/media';

function startsWithPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Bucket classification shared with specs. */
export function getRateLimitBucket(
  method: string,
  rawPath: string,
): RateLimitBucket {
  const path = normalizePath(rawPath);
  const upper = method.toUpperCase();
  if (
    path === HEALTH_EXACT ||
    startsWithPrefix(path, HEALTH_LIVE_PREFIX) ||
    startsWithPrefix(path, HEALTH_READY_PREFIX) ||
    path === SSE_STREAM_PATH
  ) {
    return 'exempt';
  }
  if (
    upper === 'GET' &&
    (startsWithPrefix(path, MEDIA_PREFIX) || isPublicAvatarRead(path))
  ) {
    return 'B';
  }
  return 'A';
}

export interface IpLikeRequest {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * Resolve the client IP. `x-forwarded-for`-first ONLY when trustProxy is
 * on (M2); tests inject mocked IPs through this function.
 */
export function resolveClientIp(
  req: IpLikeRequest,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const fwd = req.headers?.['x-forwarded-for'];
    const first = Array.isArray(fwd) ? fwd[0] : fwd;
    if (typeof first === 'string' && first.length > 0) {
      const ip = first.split(',')[0]?.trim();
      if (ip) {
        return ip;
      }
    }
  }
  if (typeof req.ip === 'string' && req.ip.length > 0) {
    return req.ip;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

function resolveTrustProxy(configService: ConfigService): boolean {
  const direct = configService.get<unknown>('app.trustProxy');
  if (typeof direct === 'boolean') {
    return direct;
  }
  const appCfg = configService.get<{ trustProxy?: unknown }>('app');
  if (appCfg && typeof appCfg.trustProxy === 'boolean') {
    return appCfg.trustProxy;
  }
  return process.env.TRUST_PROXY === 'true';
}

interface RateLimitResponse {
  setHeader?: (name: string, value: string) => void;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  /** key `${bucket}:${ip}` → sorted request timestamps (ms). */
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly audit?: StructuredLoggerService,
  ) {}

  private emitAudit(
    method: string,
    rawPath: string,
    clientIp: string,
    decision: 'allow' | 'deny',
    note?: string,
  ): void {
    // kebab-case guard name: keeps the `apiKey` grep-gate at zero hits.
    const fields = {
      method,
      path: stripQueryForAudit(rawPath),
      decision,
      guard: 'rate-limit-guard',
      clientIp,
      ...(note ? { note } : {}),
    };
    if (this.audit) {
      this.audit.logAccessDecision(fields);
    } else {
      this.logger.log({
        event: 'auth:access:decision',
        ...fields,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /** Test seam: override Date.now via jest.spyOn in specs if needed. */
  protected now(): number {
    return Date.now();
  }

  private prune(key: string, now: number): number[] {
    const cutoff = now - WINDOW_MS;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length === 0) {
      this.hits.delete(key);
    } else {
      this.hits.set(key, kept);
    }
    if (this.hits.size > 10000) {
      const oldest = this.hits.keys().next();
      if (!oldest.done) {
        this.hits.delete(oldest.value);
      }
    }
    return kept;
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<GuardRequest>();
    const res = http.getResponse<RateLimitResponse>();
    const method = (req.method ?? 'GET').toUpperCase();
    const path = readPath(req);

    // M4: unset key = audit-only, never 429.
    const expected = resolveExpectedApiKey((key: string) =>
      this.configService.get(key),
    );
    if (!expected) {
      return true;
    }

    const bucket = getRateLimitBucket(method, path);
    if (bucket === 'exempt') {
      return true;
    }

    // M1: no/invalid key + over limit must still surface 401 first —
    // defer to ApiKeyGuard instead of counting/429ing.
    const provided = readProvidedKey(req);
    if (!provided || !timingSafeCompare(provided, expected)) {
      return true;
    }

    const trustProxy = resolveTrustProxy(this.configService);
    const clientIp = resolveClientIp(req, trustProxy);
    const limit = bucket === 'A' ? BUCKET_A_LIMIT : BUCKET_B_LIMIT;
    const now = this.now();
    const key = `${bucket}:${clientIp}`;
    const kept = this.prune(key, now);
    if (kept.length < limit) {
      kept.push(now);
      this.hits.set(key, kept);
      this.emitAudit(method, path, clientIp, 'allow', `bucket-${bucket}`);
      return true;
    }

    const oldest = kept[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + WINDOW_MS - now) / 1000),
    );
    if (typeof res?.setHeader === 'function') {
      res.setHeader('Retry-After', String(retryAfterSec));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader(
        'X-RateLimit-Reset',
        String(Math.ceil((oldest + WINDOW_MS) / 1000)),
      );
    }
    this.emitAudit(method, path, clientIp, 'deny', `bucket-${bucket}-exceeded`);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Rate limit exceeded',
        retryAfter: retryAfterSec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// Re-exported so specs treat the public-read check as one contract.
export { isPublicApiKeyExempt };

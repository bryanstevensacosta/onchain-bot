import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AccessDecision, stripQueryForAudit } from './access-audit';
import { StructuredLoggerService } from '../logging/structured-logger.service';

/**
 * Global API-key auth for ingestion-telegram (sec1 hardened, gap 19 full).
 *
 * Contract (shared with backend lane):
 * - ingestion env: INGESTION_API_KEY (this service)
 * - backend env: INGESTION_TELEGRAM_API_KEY (backend sends it)
 * - transport: header 'x-api-key' canonical; query '?apiKey=' kept as
 *   deprecated legacy for backend compat (docs steer to the header).
 *
 * Behavior:
 * - UNSET (empty/undefined): Logger.warn once + allow-all (dev/e2e convenience).
 * - SET: every machine read requires a timing-safe key match, else 401.
 *   Dual-prefix parity: '/api/feed' AND '/api/crypto-news' are BOTH
 *   protected (closes the hole where crypto-news reads 401 while feed
 *   reads stayed public).
 *
 * Public (keyless, GET only):
 * - exact GET /api/health, GET /api/health/ready, GET /api/health/live
 *   (Docker HEALTHCHECK hits /api/health — must stay public).
 * - GET /api/media/* (browser bytes stay public — D1).
 * - GET /api/kol-avatar/:channelId single-segment reads (browser bytes —
 *   photo or placeholder, always 200; D1).
 * Protected (401 without key): everything else, including GET feed reads,
 * GET /api/health/channels, GET /api/ingestion/stream, GET /metrics,
 * GET /debug/*, and ALL writes (POST/PATCH/DELETE sources*, POST refresh).
 */
export const PROTECTED_FEED_PREFIXES = ['/api/feed', '/api/crypto-news'];
const PUBLIC_MEDIA_PREFIX = '/api/media';
const HEALTH_EXACT = '/api/health';
const HEALTH_LIVE_PREFIX = '/api/health/live';
const HEALTH_READY_PREFIX = '/api/health/ready';
const SSE_STREAM_PATH = '/api/ingestion/stream';

export function normalizePath(rawPath: string): string {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath;
  const withSlash = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`;
  return withSlash.length > 1 && withSlash.endsWith('/')
    ? withSlash.slice(0, -1)
    : withSlash;
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Public avatar read = exactly one path segment (the channel id). */
export function isPublicAvatarRead(path: string): boolean {
  return /^\/api\/kol-avatar\/[^/]+$/.test(path);
}

/** Exported for unit tests: true when the request is keyless-public. */
export function isPublicApiKeyExempt(method: string, rawPath: string): boolean {
  if (method.toUpperCase() !== 'GET') {
    return false;
  }
  const path = normalizePath(rawPath);
  if (path === HEALTH_EXACT) {
    return true;
  }
  if (matchesPrefix(path, HEALTH_LIVE_PREFIX)) {
    return true;
  }
  if (matchesPrefix(path, HEALTH_READY_PREFIX)) {
    return true;
  }
  if (matchesPrefix(path, PUBLIC_MEDIA_PREFIX)) {
    return true;
  }
  if (isPublicAvatarRead(path)) {
    return true;
  }
  return false;
}

/** Timing-safe string compare; false on length mismatch (no throw). */
export function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export interface GuardRequest {
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export function readPath(req: GuardRequest): string {
  if (typeof req.path === 'string' && req.path.length > 0) {
    return req.path;
  }
  const fallback =
    typeof req.originalUrl === 'string' && req.originalUrl.length > 0
      ? req.originalUrl
      : typeof req.url === 'string'
        ? req.url
        : '/';
  return fallback.split('?')[0] ?? '/';
}

export function readProvidedKey(req: GuardRequest): string | undefined {
  const headerValue = req.headers?.['x-api-key'];
  const headerKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof headerKey === 'string' && headerKey.length > 0) {
    return headerKey;
  }
  const queryValue = req.query?.['apiKey'];
  const queryKey = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  if (typeof queryKey === 'string' && queryKey.length > 0) {
    return queryKey;
  }
  return undefined;
}

/** Shared expected-key resolution (also used by RateLimitGuard for M1). */
export function resolveExpectedApiKey(
  get: (key: string) => unknown,
): string | undefined {
  const direct = get('app.apiKey');
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }
  const appCfg = get('app') as
    | { apiKey?: unknown; security?: { apiKey?: unknown } }
    | undefined;
  if (
    appCfg &&
    typeof appCfg.apiKey === 'string' &&
    appCfg.apiKey.trim().length > 0
  ) {
    return appCfg.apiKey.trim();
  }
  const nested = appCfg?.security?.apiKey;
  if (typeof nested === 'string' && nested.trim().length > 0) {
    return nested.trim();
  }
  return undefined;
}

function readClientIp(req: GuardRequest): string {
  if (typeof req.ip === 'string' && req.ip.length > 0) {
    return req.ip;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private warnedUnset = false;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly audit?: StructuredLoggerService,
  ) {}

  private emitAudit(
    method: string,
    rawPath: string,
    clientIp: string,
    decision: AccessDecision,
    note?: string,
  ): void {
    // guard name is kebab-case on purpose: the audit grep-gate asserts zero
    // `apiKey` hits over captured logs, and `ApiKeyGuard` would trip it.
    const fields = {
      method,
      path: stripQueryForAudit(rawPath),
      decision,
      guard: 'api-key-guard',
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

  private resolveExpectedKey(): string | undefined {
    return resolveExpectedApiKey((key: string) => this.configService.get(key));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GuardRequest>();
    const expected = this.resolveExpectedKey();
    const method = (req.method ?? 'GET').toUpperCase();
    const path = readPath(req);
    const clientIp = readClientIp(req);

    if (!expected) {
      if (!this.warnedUnset) {
        this.warnedUnset = true;
        this.logger.warn(
          'INGESTION_API_KEY is not set — API-key auth is disabled (allow-all). Set INGESTION_API_KEY to protect sensitive routes.',
        );
        this.emitAudit(method, path, clientIp, 'allow', 'unset-key-allow-all');
      }
      return true;
    }

    if (isPublicApiKeyExempt(method, path)) {
      this.emitAudit(method, path, clientIp, 'allow', 'public-exempt');
      return true;
    }

    const provided = readProvidedKey(req);
    if (!provided || !timingSafeCompare(provided, expected)) {
      this.emitAudit(method, path, clientIp, 'deny');
      throw new UnauthorizedException('Invalid or missing API key');
    }
    this.emitAudit(method, path, clientIp, 'allow');
    return true;
  }
}

/** Re-exported for the rate limiter: the SSE handshake path is exempt. */
export { SSE_STREAM_PATH };

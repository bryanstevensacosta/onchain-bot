import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Partial API-key auth for ingestion-telegram (gap 19).
 *
 * Contract (shared with backend lane):
 * - ingestion env: INGESTION_API_KEY (this service)
 * - backend env: INGESTION_TELEGRAM_API_KEY (backend sends it)
 * - transport: header 'x-api-key' OR query '?apiKey='
 *
 * Behavior:
 * - UNSET (empty/undefined): Logger.warn once + allow-all (dev/e2e convenience).
 * - SET: public GET reads stay keyless; everything else requires a
 *   timing-safe key match, else 401.
 *
 * Public allowlist (GET only, exact prefixes):
 * - /api/feed/*, /api/media/*, /api/health, /api/health/live, /api/health/ready
 *   (Docker HEALTHCHECK hits /api/health — must stay public).
 * Protected: /api/ingestion/stream, /debug/*, /metrics, everything else
 * (including POST/PATCH/DELETE under /api/feed).
 */
const PUBLIC_FEED_PREFIX = '/api/feed';
const PUBLIC_MEDIA_PREFIX = '/api/media';
const HEALTH_EXACT = '/api/health';
const HEALTH_LIVE_PREFIX = '/api/health/live';
const HEALTH_READY_PREFIX = '/api/health/ready';

function normalizePath(rawPath: string): string {
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
  if (matchesPrefix(path, PUBLIC_FEED_PREFIX)) {
    return true;
  }
  if (matchesPrefix(path, PUBLIC_MEDIA_PREFIX)) {
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

interface GuardRequest {
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

function readPath(req: GuardRequest): string {
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

function readProvidedKey(req: GuardRequest): string | undefined {
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

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private warnedUnset = false;

  constructor(private readonly configService: ConfigService) {}

  private resolveExpectedKey(): string | undefined {
    const direct = this.configService.get<string>('app.apiKey');
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return direct.trim();
    }
    const appCfg = this.configService.get<{
      apiKey?: unknown;
      security?: { apiKey?: unknown };
    }>('app');
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

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GuardRequest>();
    const expected = this.resolveExpectedKey();

    if (!expected) {
      if (!this.warnedUnset) {
        this.warnedUnset = true;
        this.logger.warn(
          'INGESTION_API_KEY is not set — API-key auth is disabled (allow-all). Set INGESTION_API_KEY to protect sensitive routes.',
        );
      }
      return true;
    }

    const method = (req.method ?? 'GET').toUpperCase();
    const path = readPath(req);
    if (isPublicApiKeyExempt(method, path)) {
      return true;
    }

    const provided = readProvidedKey(req);
    if (!provided || !timingSafeCompare(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}

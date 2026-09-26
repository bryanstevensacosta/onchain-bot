import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_INJECTION_TOKEN = 'KOL_CALLS_API_KEY';

/**
 * Guards endpoints with a shared API key (Tramo 1, todo 23, P50).
 *
 * Applied to EVERY controller except `GET /api/health`:
 * - When KOL_CALLS_API_KEY is empty, the guard fails open (keyless dev).
 * - Otherwise the request must carry the exact key in the x-api-key header;
 *   missing/wrong keys throw 401 (never 403 — auth vs ownership stay apart).
 *
 * Back-compat: the pre-rename `KOL_SYSTEM_API_KEY` env is still honored as
 * a fallback (new key wins when both are set).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(API_KEY_INJECTION_TOKEN)
    private readonly injectedApiKey?: string,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const expected =
      this.injectedApiKey ??
      (process.env.KOL_CALLS_API_KEY ?? process.env.KOL_SYSTEM_API_KEY ?? '').trim();
    if (expected === '') {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
    }>();
    const provided = request?.headers?.[API_KEY_HEADER];
    if (typeof provided === 'string' && provided === expected) {
      return true;
    }
    throw new UnauthorizedException('invalid or missing x-api-key');
  }
}

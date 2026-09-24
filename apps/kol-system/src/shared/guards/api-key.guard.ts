import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_INJECTION_TOKEN = 'KOL_SYSTEM_API_KEY';

/**
 * Guards feed endpoints with a shared API key.
 *
 * Mirrors the backend feed-identity contract (x-api-key header):
 * - When KOL_SYSTEM_API_KEY is empty, the guard fails open (keyless dev).
 * - Otherwise the request must carry the exact key in the x-api-key header.
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
      this.injectedApiKey ?? (process.env.KOL_SYSTEM_API_KEY ?? '').trim();
    if (expected === '') {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
    }>();
    const provided = request?.headers?.[API_KEY_HEADER];
    return typeof provided === 'string' && provided === expected;
  }
}

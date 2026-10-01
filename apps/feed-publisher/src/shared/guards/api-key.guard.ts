import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_KEY_HEADER, isAuthorized } from '../security/api-key';

export const API_KEY_INJECTION_TOKEN = 'FEED_PUBLISHER_API_KEY';

/**
 * Guards inbound endpoints with a shared API key (todo 14, P50:
 * registered as a global APP_GUARD — every controller except @Public()
 * health requires the key).
 *
 * Mirrors the backend feed-identity contract (x-api-key header):
 * - When FEED_PUBLISHER_API_KEY is empty, the guard fails open (keyless dev).
 * - @Public() routes (health) always pass.
 * - Otherwise the request must carry the exact key in x-api-key;
 *   mismatches throw 401 (never a silent false, so scanners see 401,
 *   not 403 — 403 is reserved for ownership violations).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const expected = (process.env.FEED_PUBLISHER_API_KEY ?? '').trim();
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
    }>();
    if (isAuthorized(request?.headers?.[API_KEY_HEADER], expected)) {
      return true;
    }
    throw new UnauthorizedException('invalid api key');
  }
}

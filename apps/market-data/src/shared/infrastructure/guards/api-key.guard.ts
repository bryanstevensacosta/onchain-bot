import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_KEY_HEADER, isAuthorized } from '../../domain/api-key';

export const API_KEY_INJECTION_TOKEN = 'MARKET_DATA_API_KEY';

/**
 * Guards inbound endpoints with a shared API key (Tramo 3, todo 1).
 *
 * - When MARKET_DATA_API_KEY is empty, the guard fails open (keyless dev).
 * - @Public() routes (health, metrics) always pass.
 * - Otherwise the request must carry the exact key in x-api-key.
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
    const expected = (process.env.MARKET_DATA_API_KEY ?? '').trim();
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
    }>();
    return isAuthorized(request?.headers?.[API_KEY_HEADER], expected);
  }
}

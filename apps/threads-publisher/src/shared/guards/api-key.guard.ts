import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_KEY_HEADER, isAuthorized } from '../security/api-key';

/**
 * Global inbound guard (P50): x-api-key on every endpoint except
 * @Public() health. Fail-open when THREADS_PUBLISHER_API_KEY is empty
 * (keyless dev); mismatches throw 401 (403 is reserved for ownership).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }
    const expected = (process.env.THREADS_PUBLISHER_API_KEY ?? '').trim();
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
    }>();
    if (isAuthorized(request?.headers?.[API_KEY_HEADER], expected)) {
      return true;
    }
    throw new UnauthorizedException('invalid api key');
  }
}

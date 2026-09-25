import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'shared/infrastructure/decorators/public.decorator';
import { RateLimiterService } from 'rate-limiter/application/rate-limiter.service';
import {
  GATEWAY_LIMIT_PER_MINUTE,
  GATEWAY_WINDOW_MS,
  buildGatewayClientKey,
} from '../domain/gateway-policy';

/**
 * GatewayRateLimitGuard (Tramo 3, todo 2, P43 edge policy;
 * hexagonal home todo 12, P50).
 *
 * 60 req/min per client IP over the shared sliding-window limiter.
 * Applied per-controller in src/gateway/ via @UseGuards — never inside
 * the feature modules. @Public() routes bypass it (health, metrics).
 */
@Injectable()
export class GatewayRateLimitGuard implements CanActivate {
  public constructor(
    private readonly limiter: RateLimiterService,
    private readonly reflector: Reflector,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ ip?: string; socket?: { remoteAddress?: string } }>();
    const client = request?.ip ?? request?.socket?.remoteAddress ?? 'unknown';
    const allowed = this.limiter.tryAcquire(
      buildGatewayClientKey(client),
      GATEWAY_LIMIT_PER_MINUTE,
      GATEWAY_WINDOW_MS,
    );
    if (!allowed) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

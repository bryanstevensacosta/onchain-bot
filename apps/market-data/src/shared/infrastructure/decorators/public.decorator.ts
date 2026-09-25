import { SetMetadata } from '@nestjs/common';

/**
 * Public() decorator (Tramo 3, todo 1).
 *
 * Marks controllers/routes that skip the ApiKeyGuard (health checks,
 * metrics). Everything else requires MARKET_DATA_API_KEY when set.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

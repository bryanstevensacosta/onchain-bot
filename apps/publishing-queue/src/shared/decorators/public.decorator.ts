import { SetMetadata } from '@nestjs/common';

/**
 * Public() decorator (Tramo 2, todo 1).
 *
 * Marks controllers/routes that skip the ApiKeyGuard (health checks,
 * metrics). Everything else requires PUBLISHING_QUEUE_API_KEY when set.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

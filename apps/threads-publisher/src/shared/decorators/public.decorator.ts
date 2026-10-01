import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public (skips the global ApiKeyGuard).
 * Health is the ONLY keyless route.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

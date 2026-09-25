import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '../domain/api-key-scope';

/**
 * Required scope for a route (Tramo 3, todo 10, P46).
 *
 * Absent metadata = `read`. Admin key-management endpoints require
 * `admin`; the batch/snapshot write surface requires `snapshot`.
 */
export const REQUIRED_SCOPE_KEY = 'marketDataRequiredScope';

export const RequireScope = (scope: ApiKeyScope): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_SCOPE_KEY, scope);

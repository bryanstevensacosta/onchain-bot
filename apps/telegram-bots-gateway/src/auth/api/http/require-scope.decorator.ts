import { SetMetadata } from '@nestjs/common';
import type { ClientScope } from '../../domain/client-credential';

export const REQUIRE_SCOPE_KEY = 'botsGateway.requireScope';

/** Marks a route (or controller) as requiring a client scope. No metadata = public. */
export const RequireScope = (scope: ClientScope) =>
  SetMetadata(REQUIRE_SCOPE_KEY, scope);

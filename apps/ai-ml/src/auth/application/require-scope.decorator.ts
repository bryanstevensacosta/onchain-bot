import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '../domain/api-key-scope';

export const REQUIRED_SCOPE_KEY = 'aiMlRequiredScope';

/** Mark a route as requiring (at least) the given key scope. */
export const RequireScope = (scope: ApiKeyScope): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_SCOPE_KEY, scope);

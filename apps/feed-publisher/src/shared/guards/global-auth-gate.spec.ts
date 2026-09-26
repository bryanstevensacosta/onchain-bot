import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { HealthController } from '../../health/api/http/health.controller';
import { SessionsController } from '../../sessions/api/http/sessions.controller';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { DomainExceptionFilter } from '../filters/domain-exception.filter';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Global auth gate (todo 14, P50): the API key guard must ride every
 * controller (APP_GUARD) with ONLY /api/health public, and DomainError
 * must map to HTTP status (APP_FILTER) so 403/429/404 survive the wire.
 */
describe('global auth gate (todo 14, P50)', () => {
  const providers: ReadonlyArray<unknown> =
    (Reflect.getMetadata('providers', AppModule) as ReadonlyArray<unknown>) ??
    [];

  it('registers the ApiKeyGuard globally', () => {
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          (provider as { provide?: unknown }).provide === APP_GUARD &&
          (provider as { useClass?: unknown }).useClass === ApiKeyGuard,
      ),
    ).toBe(true);
  });

  it('registers the DomainExceptionFilter globally', () => {
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          (provider as { provide?: unknown }).provide === APP_FILTER &&
          (provider as { useClass?: unknown }).useClass ===
            DomainExceptionFilter,
      ),
    ).toBe(true);
  });

  it('leaves ONLY the health controller public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, SessionsController),
    ).toBeUndefined();
  });
});

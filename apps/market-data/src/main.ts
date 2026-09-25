import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstrap for market-data skeleton (Tramo 3, todo 1, Variante A).
 *
 * Listens on MARKET_DATA_PORT (dev :4000, staging host :4001, prod :4002)
 * with a global ValidationPipe. Serves GET /api/health -> { status: 'ok' }.
 * NO business logic: token/chain/provider/cache/rate-limiter are stubs
 * until todos 2-3.
 */
async function bootstrap(): Promise<void> {
  process.noDeprecation = true;

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.MARKET_DATA_PORT ?? 4000);
  // P46: loopback-only by default; Tailscale/off-droplet exposure is an
  // explicit operator decision (MARKET_DATA_HOST=0.0.0.0 or the tailscale
  // IP), never the default. See AGENTS.md §SECURITY.
  const host = process.env.MARKET_DATA_HOST ?? '127.0.0.1';
  await app.listen(port, host);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('market-data bootstrap failed', err);
  process.exit(1);
});

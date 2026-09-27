import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstrap for kol-calls-publisher (P51 split from kol-system).
 *
 * Listens on KOL_CALLS_PUBLISHER_PORT (dev :3060, staging host :3061,
 * prod host :3062) with a global ValidationPipe. Serves
 * GET /api/health -> { status: 'ok', components }. Reads mentions +
 * snapshots from upstream kol-calls over HTTP (P51 contract) — never
 * subscribes to SSE directly, never touches the kol-calls DB.
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

  const port = Number(process.env.KOL_CALLS_PUBLISHER_PORT ?? 3060);
  await app.listen(port);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('kol-calls-publisher bootstrap failed', err);
  process.exit(1);
});

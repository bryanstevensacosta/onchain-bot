import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstrap for content-publisher skeleton (Tramo 2, todo 1).
 *
 * Listens on CONTENT_PUBLISHER_PORT (dev :3040, staging :3041, prod :3042)
 * with a global ValidationPipe. Serves GET /api/health -> { status: 'ok' }.
 * NO business logic. P10: this app NEVER subscribes to kol-type messages.
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

  const port = Number(process.env.CONTENT_PUBLISHER_PORT ?? 3040);
  await app.listen(port);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('content-publisher bootstrap failed', err);
  process.exit(1);
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstrap for kol-calls (Tramo 1, todo 2; renamed from kol-system).
 *
 * Listens on port 3050 with a global ValidationPipe. Serves
 * GET /api/health -> { status: 'ok' }. NO business logic.
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

  const port = Number(process.env.KOL_CALLS_PORT ?? process.env.KOL_SYSTEM_PORT ?? 3050);
  await app.listen(port);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('kol-calls bootstrap failed', err);
  process.exit(1);
});

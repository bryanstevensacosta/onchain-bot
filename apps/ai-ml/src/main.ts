import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstrap for ai-ml (todo 0).
 *
 * Listens on AI_ML_PORT (dev :4090, staging host :4091, prod :4092)
 * with a global ValidationPipe. Serves GET /api/health ->
 * { status: 'ok' } + the LLM gateway under /api/llm/*.
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

  const port = Number(process.env.AI_ML_PORT ?? 4090);
  // Container default: bind all interfaces so published ports are reachable
  // from the host (loopback-in-container is unreachable via port mapping).
  // Staging/prod set AI_ML_HOST=0.0.0.0 in their env files; dev may pin
  // AI_ML_HOST=127.0.0.1 for loopback-only.
  const host = process.env.AI_ML_HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('ai-ml bootstrap failed', err);
  process.exit(1);
});

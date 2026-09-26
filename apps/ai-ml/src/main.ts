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
  // Loopback-only by default; wider exposure is an explicit operator
  // decision (AI_ML_HOST=0.0.0.0 or the Tailscale IP), never the default.
  const host = process.env.AI_ML_HOST ?? '127.0.0.1';
  await app.listen(port, host);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('ai-ml bootstrap failed', err);
  process.exit(1);
});

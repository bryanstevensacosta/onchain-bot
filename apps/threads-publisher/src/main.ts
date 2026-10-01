import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  buildThreadsPublisherConfig,
  validateThreadsPublisherConfig,
} from './shared/config/app.config';

/**
 * Bootstrap for threads-publisher (todo 9).
 *
 * Listens on THREADS_PUBLISHER_PORT (dev :4100, staging host :4101,
 * prod host :4102) with a global ValidationPipe. Serves
 * GET /api/health -> { status: 'ok', components }.
 * Meta Threads sends go direct+gateway dual-run (THREADS_PUBLISH_MODE).
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

  const cfg = buildThreadsPublisherConfig();
  try {
    const { warnings } = validateThreadsPublisherConfig();
    for (const warning of warnings) {
      console.warn(`threads-publisher config: ${warning}`);
    }
  } catch (err) {
    console.error('threads-publisher config invalid', err);
    process.exit(1);
  }

  await app.listen(cfg.port);
}

bootstrap().catch((err) => {
  console.error('threads-publisher bootstrap failed', err);
  process.exit(1);
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  buildSchedulingPostsConfig,
  validateSchedulingPostsConfig,
} from './shared/config/app.config';

/**
 * Bootstrap for scheduling-posts (todos 1-2).
 *
 * Listens on SCHEDULING_POSTS_PORT (dev :4080, staging :4081, prod
 * :4082) with a global ValidationPipe. Serves GET /api/health ->
 * `{ status: 'ok', components }`. Telegram sends go ONLY via the
 * telegram-bots-gateway (P42) — no Bot API leg exists here.
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

  const cfg = buildSchedulingPostsConfig();
  try {
    const { warnings } = validateSchedulingPostsConfig();
    for (const warning of warnings) {
      // eslint-disable-next-line no-console
      console.warn(`scheduling-posts config: ${warning}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('scheduling-posts config invalid', err);
    process.exit(1);
  }

  await app.listen(cfg.port);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('scheduling-posts bootstrap failed', err);
  process.exit(1);
});

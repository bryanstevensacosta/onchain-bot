import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstrap for dexter-onchain-bot (Tramo 3, todo 9, P13).
 *
 * Listens on DEXTER_PORT (dev :4060, staging host :4061, prod :4062)
 * with a global ValidationPipe. Serves GET /api/health -> { status: 'ok' }.
 * Lookup-only bot: answers user scans via market-data HTTP; never
 * publishes to channels. Without DEXTER_BOT_TOKEN the HTTP surface
 * still boots (bot ingress stays inactive with a warn).
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

  const port = Number(process.env.DEXTER_PORT ?? 4060);
  const host = process.env.DEXTER_HOST ?? '127.0.0.1';
  await app.listen(port, host);
}

// eslint-disable-next-line no-console
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('dexter-onchain-bot bootstrap failed', err);
  process.exit(1);
});

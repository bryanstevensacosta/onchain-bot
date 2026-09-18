import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

/**
 * Bootstrap function for the Ingestion Service
 *
 * This service provides centralized Telegram MTProto ingestion
 * and distributes messages to multiple backend environments via SSE.
 *
 * Per Requirement 6.3: Default port 3031
 * Per Requirement 2.5: CORS enabled for backend environments
 */
async function bootstrap() {
  // Suppress deprecation warnings from pg@8 (TypeORM synchronize triggers client.query warnings)
  process.noDeprecation = true;

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Use Pino logger for structured logging
  app.useLogger(app.get(Logger));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for backend environments
  app.enableCors({
    origin: [
      'http://localhost:3030', // Backend DEV
      'http://127.0.0.1:3030', // Backend DEV (alternate)
      process.env.BACKEND_STAGING_URL || 'http://staging-backend:3030',
      process.env.BACKEND_PROD_URL || 'http://prod-backend:3030',
    ],
    credentials: true,
  });

  const port = process.env.PORT || 3031;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 Ingestion Service listening on port ${port}`);
  logger.log(
    `📡 SSE streaming endpoint: http://localhost:${port}/api/ingestion/stream`,
  );
  logger.log(
    `🖼️  Media endpoint: http://localhost:${port}/api/media/:channelId/:messageId/:index`,
  );
  logger.log(`💚 Health endpoint: http://localhost:${port}/api/health`);
}

bootstrap();

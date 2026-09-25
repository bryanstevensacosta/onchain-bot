import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { buildAppConfig } from './shared/config/app.config';
import { DomainExceptionFilter } from './shared/filters/domain-exception.filter';

/**
 * telegram-bots-gateway bootstrap. Port triplet 4070/4071/4072
 * (dev/staging/prod — verified free with `lsof -i :4070`).
 * No ENCRYPTION_KEY -> clear error, no listen (fail-closed).
 */
async function bootstrap() {
  process.noDeprecation = true;

  let config;
  try {
    config = buildAppConfig();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[bots-gateway] ${(err as Error).message}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());

  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(
    `telegram-bots-gateway listening on :${config.port} (health: /api/health)`,
  );
}

bootstrap();

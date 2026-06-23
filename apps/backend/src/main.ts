import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { DomainErrorFilter } from './shared/filters/domain-error.filter';
import type { AppConfig } from 'shared/common/config/app.config';

// Safety net: log unhandled rejections instead of crashing.
// Background event handlers / queue consumers may produce async errors
// that aren't awaited (fire-and-forget) — they shouldn't bring down the app.
const bootLogger = new Logger('Bootstrap');
process.on('unhandledRejection', (reason) => {
  bootLogger.error(
    `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
    reason instanceof Error ? reason.stack : undefined,
  );
});
process.on('uncaughtException', (err) => {
  bootLogger.error(`Uncaught exception: ${err.message}`, err.stack);
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const appService = app.get(AppService);
  appService.setNestApp(app);

  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);
  const appCfg = config.get<AppConfig>('app');
  const port = appCfg?.port ?? 3000;
  const env = appCfg?.nodeEnv ?? 'development';

  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalFilters(new DomainErrorFilter());

  await app.listen(port);

  bootLogger.log(`Running in ${env} mode on port ${port}`);
}

void bootstrap();

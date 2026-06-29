import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { DomainErrorFilter } from './shared/filters/domain-error.filter';
import { FilteredBootstrapLogger } from './shared/common/filtered-bootstrap-logger';
import type { AppConfig } from 'shared/common/config/app.config';

// Load .env.dev then .env before any module import. Required so decorator-time
// helpers (isDatabaseEnabled) see DATABASE_ENABLED before SettingsModule /
// IdentityModule evaluate their @Module imports.
for (const name of ['.env.dev', '.env']) {
  const p = path.resolve(process.cwd(), name);
  if (fs.existsSync(p)) {
    dotenvConfig({ path: p, override: false });
  }
}

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

// Suppress the pg@8 "client.query() while already executing" deprecation.
// Triggered by TypeORM's `synchronize: true` schema sync, which fires many
// introspection+DDL queries on the same underlying Client. The behaviour is
// supported by pg today and only slated for removal in pg@9.0; silencing
// keeps boot output clean until the project migrates to migrations-based
// schema management, at which point the warning disappears naturally.
//
// Note: `process.on('warning')` does NOT suppress Node's default stderr
// print of deprecation warnings in Node 22+ — they print first, then the
// listener fires. The reliable way to mute them is the noDeprecation flag.
process.noDeprecation = true;

async function bootstrap(): Promise<void> {
  // bufferLogs: true defers all logger output until app.useLogger() is called,
  // so the FilteredBootstrapLogger can drop boot-machinery lines without us
  // missing any application log that fires during module instantiation.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(new FilteredBootstrapLogger('Nest'));

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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

console.log('[DEBUG] 1. Starting bootstrap - loading .env files');
for (const name of ['.env.dev', '.env']) {
  const p = path.resolve(process.cwd(), name);
  if (fs.existsSync(p)) {
    console.log(`[DEBUG] 1a. Loading ${name}`);
    dotenvConfig({ path: p, override: false });
  }
}

console.log('[DEBUG] 2. Importing modules');
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';

console.log('[DEBUG] 3. Importing AppModule');
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { DomainErrorFilter } from './shared/filters/domain-error.filter';
import { FilteredBootstrapLogger } from './shared/common/filtered-bootstrap-logger';
import type { AppConfig } from 'shared/common/config/app.config';
import { appConfig } from 'shared/common/config/app.config';
import {
  validateAppConfig,
  ConfigValidationError,
} from 'shared/common/config/config-validator';

console.log('[DEBUG] 4. Setting up error handlers');
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

process.noDeprecation = true;

console.log('[DEBUG] 5. Validating config');
const cfg = appConfig();
try {
  const { warnings } = validateAppConfig(cfg);
  for (const w of warnings) {
    bootLogger.warn(`Config warning: ${w}`);
  }
} catch (err) {
  if (err instanceof ConfigValidationError) {
    bootLogger.fatal(err.message);
    process.exit(1);
  }
  throw err;
}

console.log('[DEBUG] 6. Setting up startup timeout');
const STARTUP_TIMEOUT_MS = 120_000;
const startupTimeout = setTimeout(() => {
  bootLogger.fatal(
    `❌ Bootstrap timeout after ${STARTUP_TIMEOUT_MS / 1000}s - process will exit`,
  );
  bootLogger.fatal(
    'Common causes: DATABASE_SYNCHRONIZE=true hanging, database connection timeout, or circular dependency',
  );
  bootLogger.fatal(
    'Check DATABASE_SYNCHRONIZE setting and database connectivity',
  );
  process.exit(1);
}, STARTUP_TIMEOUT_MS);

async function bootstrap(): Promise<void> {
  console.log('[DEBUG] 7. Creating NestJS app');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  console.log('[DEBUG] 8. App created, configuring');

  app.useLogger(app.get(FilteredBootstrapLogger));

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

  console.log('[DEBUG] 9. Starting server on port', port);
  await app.listen(port);

  clearTimeout(startupTimeout);

  bootLogger.log(`Running in ${env} mode on port ${port}`);
  console.log('[DEBUG] 10. Bootstrap complete');
}

console.log('[DEBUG] 6.5. Calling bootstrap()');
void bootstrap();

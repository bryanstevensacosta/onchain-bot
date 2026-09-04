import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

console.log('[DEBUG] 1. Starting bootstrap - loading .env files');
// Load .env.dev first with override=true to ensure dev settings take precedence
const devEnvPath = path.resolve(process.cwd(), '.env.dev');
if (fs.existsSync(devEnvPath)) {
  console.log('[DEBUG] 1a. Loading .env.dev (with override)');
  dotenvConfig({ path: devEnvPath, override: true });
}
// Load .env second with override=false to fill in missing variables
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log('[DEBUG] 1a. Loading .env (without override)');
  dotenvConfig({ path: envPath, override: false });
}
console.log('[DEBUG] 1b. After loading env files:', {
  USE_MOCK_INGESTION: process.env.USE_MOCK_INGESTION,
  USE_SSE_INGESTION: process.env.USE_SSE_INGESTION,
});

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
  console.log('[DEBUG] 8. App created, configuring logger');

  app.useLogger(app.get(FilteredBootstrapLogger));

  console.log('[DEBUG] 8.1. Setting AppService');
  const appService = app.get(AppService);
  appService.setNestApp(app);

  console.log('[DEBUG] 8.2. Enabling CORS');
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  console.log('[DEBUG] 8.3. Setting up global pipes');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  console.log('[DEBUG] 8.4. Reading config');
  const config = app.get(ConfigService);
  const appCfg = config.get<AppConfig>('app');
  const port = appCfg?.port ?? 3000;
  const env = appCfg?.nodeEnv ?? 'development';

  console.log('[DEBUG] 8.5. Setting up WebSocket adapter');
  app.useWebSocketAdapter(new IoAdapter(app));

  console.log('[DEBUG] 8.6. Setting up global filters');
  app.useGlobalFilters(new DomainErrorFilter());

  console.log(`[DEBUG] 9. About to call app.listen(${port})`);
  console.log(
    '[DEBUG] 9a. This will trigger OnModuleInit/OnApplicationBootstrap hooks',
  );

  // Wrap app.listen with timeout to see if it hangs
  const listenPromise = app.listen(port);
  const listenTimeout = setTimeout(() => {
    console.log('[DEBUG] 9b. ⚠️ app.listen() is taking more than 5 seconds');
    console.log(
      '[DEBUG] 9b. Likely a lifecycle hook (OnModuleInit/OnApplicationBootstrap) is hanging',
    );
  }, 5000);

  await listenPromise;
  clearTimeout(listenTimeout);

  console.log('[DEBUG] 9c. ✓ app.listen() completed successfully');
  clearTimeout(startupTimeout);

  // Clear startup timeout - app successfully started
  clearTimeout(startupTimeout);

  bootLogger.log(`Running in ${env} mode on port ${port}`);
  console.log('[DEBUG] 10. Bootstrap complete');
}

console.log('[DEBUG] 6.5. Calling bootstrap()');
void bootstrap();

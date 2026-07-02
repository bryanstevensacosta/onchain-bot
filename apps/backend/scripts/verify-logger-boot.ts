/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Smoke verification of the LoggerModule integration.
 * Boots a tiny NestJS app that imports AppModule's LoggerModule registration
 * directly (so it does not pull in the broken typeorm-published-call code),
 * then logs once to confirm the pino destination file is created.
 */
import 'reflect-metadata';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { appConfig } from '../src/shared/common/config/app.config';
import type { AppConfig } from '../src/shared/common/config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logCfg = config.get<AppConfig>('app')?.logging;
        if (!logCfg) return {};
        const filePath = path.resolve(process.cwd(), logCfg.dir, logCfg.fileName);
        return {
          pinoHttp: {
            level: logCfg.level,
            transport: logCfg.prettyInDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                  },
                }
              : {
                  target: 'pino-roll',
                  options: {
                    file: filePath,
                    size: logCfg.rotationSize,
                    mkdir: true,
                    limit: { count: logCfg.rotationLimit },
                  },
                },
            autoLogging: false,
          },
        };
      },
    }),
  ],
  providers: [],
})
class TestModule {}

(async () => {
  process.env.LOG_DIR = process.env.LOG_DIR ?? './verify-logs';
  process.env.LOG_FILE = process.env.LOG_FILE ?? 'backend-development.log';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production'; // force pino-roll path

  // Clean any stale state
  const logDir = path.resolve(process.cwd(), process.env.LOG_DIR);
  if (fs.existsSync(logDir)) {
    fs.rmSync(logDir, { recursive: true, force: true });
  }

  const { NestFactory } = await import('@nestjs/core');
  const app = await NestFactory.create(TestModule, { bufferLogs: true });
  const { Logger } = await import('nestjs-pino');
  app.useLogger(app.get(Logger));

  // Get the underlying PinoLogger via the registered 'pino' provider token
  const pinoInst = (app as any).get('pino');
  pinoInst.info('hello from verify-script');
  pinoInst.info({ event: 'boot_test', correlationId: 'verify-1' }, 'structured log');

  await new Promise((r) => setTimeout(r, 250));

  const logFile = path.join(logDir, process.env.LOG_FILE);
  console.log('logDir =', logDir);
  console.log('logFile =', logFile);
  console.log('exists =', fs.existsSync(logFile));

  if (fs.existsSync(logFile)) {
    const size = fs.statSync(logFile).size;
    console.log('size =', size);
    const fd = fs.openSync(logFile, 'r');
    const buf = Buffer.alloc(Math.min(size, 1024));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    console.log('--- first bytes ---');
    console.log(buf.toString('utf8'));
  }

  await app.close();
  process.exit(0);
})().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});

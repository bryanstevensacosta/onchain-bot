import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from 'shared/common/config/app.config';
import { PERSISTED_ENTITIES } from './entities';

/**
 * Returns true when the runtime has Postgres available. Read once at
 * module-import time from the process env. Both `dotenv` (loaded by
 * `ConfigModule.forRoot({ envFilePath: ['.env'] })`) and the OS env
 * contribute to `process.env`, so by the time `AppModule` evaluates
 * this constant, the value reflects `.env`.
 */
export function isDatabaseEnabled(): boolean {
  return (process.env.DATABASE_ENABLED ?? 'false').toLowerCase() === 'true';
}

/**
 * Returns true when the runtime environment is production-like (staging or production).
 * In production-like environments, TypeORM should use migration-based schema management
 * (synchronize: false) instead of automatic schema synchronization.
 *
 * @returns true for NODE_ENV='staging' or NODE_ENV='production', false otherwise
 */
export function isProductionLikeEnvironment(): boolean {
  const env = process.env.NODE_ENV?.toLowerCase();
  return env === 'staging' || env === 'production';
}

/**
 * Wraps `TypeOrmModule.forRootAsync()` so the rest of the app can
 * `imports: [DatabaseModule]` unconditionally. When `DATABASE_ENABLED=false`,
 * the wrapper returns an empty module and `@nestjs/typeorm` never
 * initializes — BC modules' `useFactory` providers then pick the
 * in-memory adapter.
 */
@Module({})
export class DatabaseModule {
  private static readonly logger = new Logger(DatabaseModule.name);

  public static forRootFromEnv(): DynamicModule {
    if (!isDatabaseEnabled()) {
      DatabaseModule.logger.log(
        'Postgres disabled (DATABASE_ENABLED=false); Tier-1 repositories use in-memory adapters.',
      );
      return { module: DatabaseModule };
    }
    return {
      module: DatabaseModule,
      imports: [
        ConfigModule,
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const cfg = config.get<AppConfig>('app')?.database;
            const useMigrations = isProductionLikeEnvironment();
            const synchronize = useMigrations
              ? false
              : (cfg?.synchronize ?? true);
            const nodeEnv = process.env.NODE_ENV ?? 'development';
            const mode = useMigrations ? 'migrations' : 'auto-sync';

            DatabaseModule.logger.log(
              `Postgres enabled (host=${cfg?.host}:${cfg?.port} db=${cfg?.database}, synchronize=${synchronize}, env=${nodeEnv}, mode=${mode}).`,
            );
            return {
              type: 'postgres' as const,
              host: cfg?.host ?? 'localhost',
              port: cfg?.port ?? 5432,
              username: cfg?.username ?? 'alpha_meta_token_scanner',
              password: cfg?.password ?? 'alpha_meta_token_scanner',
              database: cfg?.database ?? 'alpha_meta_token_scanner',
              entities: PERSISTED_ENTITIES,
              synchronize,
              logging: cfg?.logging ? 'all' : false,
              retryAttempts: 5,
              retryDelay: 2000,
              // Connection timeout: 10s per attempt (total 50s with 5 retries)
              // Prevents indefinite hangs when DB is unreachable or blocking
              connectTimeoutMS: 10_000,
              // Extra postgres config to prevent synchronize hangs
              extra: {
                // Statement timeout: 30s max per query during sync
                // This catches cases where synchronize introspection queries hang
                statement_timeout: 30_000,
                // Idle in transaction timeout: 60s max
                idle_in_transaction_session_timeout: 60_000,
              },
            };
          },
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}

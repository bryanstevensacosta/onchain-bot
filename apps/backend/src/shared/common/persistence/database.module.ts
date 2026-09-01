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
 * Emergency hotfix: Patches TypeORM PostgresDriver to skip CREATE EXTENSION
 * query during afterConnect() which hangs indefinitely in staging environment.
 *
 * **Context:**
 * - TypeORM 0.3.30 PostgresDriver.afterConnect() executes:
 *   `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
 * - In staging environment, this query hangs indefinitely (never returns)
 * - Extension already exists; manual execution completes instantly
 * - Backend startup hangs after config warnings, never reaches health check
 * - Root cause unknown (possibly pg driver version, connection pool, or PG server config)
 *
 * **Safety:**
 * - uuid-ossp extension is NOT used by our entities (we use BIGINT/VARCHAR PKs)
 * - Skipping this query has no functional impact on our application
 * - Only affects staging environment (NODE_ENV === 'staging')
 * - Monkey-patch executes before TypeORM initialization
 *
 * **Permanent Fix:**
 * - Requires TypeORM driver configuration option to disable afterConnect hooks
 * - OR upgrade to TypeORM version with configurable extension creation
 * - OR investigate root cause of hanging CREATE EXTENSION query
 *
 * **Applied:** When NODE_ENV=staging, before TypeOrmModule.forRootAsync()
 */
function patchPostgresDriverForStagingHang(): void {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  if (nodeEnv !== 'staging') {
    return; // Only apply patch in staging
  }

  const logger = new Logger('DatabaseModule:StagingPatch');

  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  try {
    // Dynamically import PostgresDriver to avoid affecting other environments
    const {
      PostgresDriver,
    } = require('typeorm/driver/postgres/PostgresDriver');

    // Save original method (for debugging/rollback if needed)
    const originalAfterConnect = PostgresDriver.prototype.afterConnect;

    // Replace with no-op that skips CREATE EXTENSION query
    PostgresDriver.prototype.afterConnect = function () {
      // Return resolved promise immediately - skip CREATE EXTENSION query
      return Promise.resolve();
    };

    logger.log(
      'Staging hang patch applied: PostgresDriver.afterConnect() will skip CREATE EXTENSION',
    );

    // Store reference for potential future rollback
    PostgresDriver.prototype.__originalAfterConnect = originalAfterConnect;
  } catch (error) {
    // Non-fatal: log error but allow initialization to continue
    // If patch fails, worst case is backend still hangs (existing behavior)
    logger.error(
      'Failed to apply staging hang patch (non-fatal):',
      error instanceof Error ? error.message : String(error),
    );
  }
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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

    // Apply staging hang patch BEFORE TypeOrmModule.forRootAsync()
    // Must execute before driver initialization
    patchPostgresDriverForStagingHang();
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
              // Migrations control: never auto-run migrations (we run them manually in deploy script)
              migrationsRun: false,
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
                // Connection pool config to prevent hanging on CREATE EXTENSION
                // Single connection in staging to minimize pool initialization overhead
                max: nodeEnv === 'staging' ? 1 : 10,
                // Query timeout at driver level (catches hung queries before they reach PostgreSQL)
                query_timeout: 5000,
                // Application name for easier debugging in pg_stat_activity
                application_name: `onchain-bot-${nodeEnv}`,
              },
            };
          },
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}

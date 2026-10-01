import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DEXTER_PERSISTED_ENTITIES } from './entities';

/**
 * DatabaseModule (dexter-message-templates todo 1 — Wave 1 foundation).
 *
 * Conditional TypeORM root, mirroring the backend
 * `shared/common/persistence/database.module.ts` shape adapted to
 * dexter's standalone layout (`@/*` alias, DATABASE_URL-first config):
 *
 * - `DATABASE_ENABLED=false` (default) → empty module, `@nestjs/typeorm`
 *   never initializes; repos resolve to in-memory adapters via `useFactory`.
 * - `DATABASE_ENABLED=true` → `TypeOrmModule.forRootAsync()` against
 *   `DATABASE_URL` (default `.../onchain_bot_dexter`, C-DB-01).
 * - `synchronize:true` ONLY in dev/test (`NODE_ENV` not staging/production
 *   AND `DATABASE_SYNCHRONIZE=true`); staging/prod ALWAYS use migrations
 *   (`synchronize:false`, `migrationsRun:false` — run `migration:run` first).
 * - Invalid `DATABASE_URL` fails boot FAST with a readable error
 *   (parsed before TypeORM init — no hang, no 120s timeout mystery).
 *
 * NOTE on constructor DI (repo rule): value imports only — never
 * `import type` for constructor-injected symbols (erases
 * `design:paramtypes` metadata → UnknownDependenciesException at boot).
 */
export function isDatabaseEnabled(): boolean {
  return (process.env.DATABASE_ENABLED ?? 'false').toLowerCase() === 'true';
}

export function isProductionLikeEnvironment(): boolean {
  const env = process.env.NODE_ENV?.toLowerCase();
  return env === 'staging' || env === 'production';
}

export interface ParsedDatabaseUrl {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/**
 * Parses DATABASE_URL or throws a human-readable error (fail-fast at
 * boot/CLI time — never let TypeORM hang on a garbage URL).
 */
export function parseDatabaseUrlOrThrow(raw: string): ParsedDatabaseUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `[dexter-db] Invalid DATABASE_URL ${JSON.stringify(raw)}: not a valid postgres URL. ` +
        `Expected shape: postgres://USER:PASSWORD@HOST:PORT/onchain_bot_dexter`,
    );
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      `[dexter-db] Invalid DATABASE_URL protocol ${JSON.stringify(url.protocol)}: ` +
        `expected "postgres:" (got ${JSON.stringify(raw)}).`,
    );
  }
  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error(
      `[dexter-db] Invalid DATABASE_URL ${JSON.stringify(raw)}: missing database name in path. ` +
        `Expected shape: postgres://USER:PASSWORD@HOST:PORT/onchain_bot_dexter`,
    );
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `[dexter-db] Invalid DATABASE_URL port ${JSON.stringify(url.port)} in ${JSON.stringify(raw)}.`,
    );
  }
  return {
    host: url.hostname || 'localhost',
    port,
    username: decodeURIComponent(url.username) || 'onchain_bot',
    password: decodeURIComponent(url.password) || 'onchain_bot',
    database,
  };
}

export function resolveDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    'postgres://onchain_bot:onchain_bot@localhost:5432/onchain_bot_dexter'
  );
}

@Module({})
export class DatabaseModule {
  private static readonly logger = new Logger(DatabaseModule.name);

  public static forRootFromEnv(): DynamicModule {
    if (!isDatabaseEnabled()) {
      DatabaseModule.logger.log(
        'Postgres disabled (DATABASE_ENABLED=false); repositories use in-memory adapters.',
      );
      return { module: DatabaseModule };
    }

    return {
      module: DatabaseModule,
      imports: [
        ConfigModule,
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: () => {
            const parsed = parseDatabaseUrlOrThrow(resolveDatabaseUrl());
            const nodeEnv = process.env.NODE_ENV ?? 'development';
            // synchronize ONLY in dev/test AND when explicitly enabled.
            // staging/prod ALWAYS go through migrations.
            const synchronize =
              !isProductionLikeEnvironment() &&
              (process.env.DATABASE_SYNCHRONIZE ?? 'true').toLowerCase() ===
                'true';

            DatabaseModule.logger.log(
              `Postgres enabled (host=${parsed.host}:${parsed.port} db=${parsed.database}, ` +
                `synchronize=${synchronize}, env=${nodeEnv}).`,
            );
            return {
              type: 'postgres' as const,
              host: parsed.host,
              port: parsed.port,
              username: parsed.username,
              password: parsed.password,
              database: parsed.database,
              entities: DEXTER_PERSISTED_ENTITIES,
              synchronize,
              logging: false,
              retryAttempts: 5,
              retryDelay: 2000,
              // Migrations are run explicitly via `npm run migration:run`
              // (deploy one-off container), never auto-run at boot.
              migrationsRun: false,
              // Fail fast on unreachable DB: 10s per attempt, 5 attempts.
              connectTimeoutMS: 10_000,
              // Skip automatic CREATE EXTENSION (hangs on non-superuser
              // connections; dexter entities use no extension types).
              installExtensions: false,
              extra: {
                statement_timeout: 30_000,
                idle_in_transaction_session_timeout: 60_000,
                max: 10,
                query_timeout: 5000,
                application_name: `dexter-onchain-bot-${nodeEnv}`,
              },
            };
          },
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}

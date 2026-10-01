import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { DEXTER_PERSISTED_ENTITIES } from './entities';
import { parseDatabaseUrlOrThrow, resolveDatabaseUrl } from './database.module';

// Load env the same way the app does: `.env.dev` wins over `.env`.
// (Second dotenv.config() call never overrides already-set keys.)
dotenv.config({ path: '.env.dev' });
dotenv.config();

const parsed = parseDatabaseUrlOrThrow(resolveDatabaseUrl());

/**
 * TypeORM CLI data-source for dexter-onchain-bot
 * (dexter-message-templates todo 1 — Wave 1 foundation).
 *
 * Used ONLY by `npm run migration:*` scripts (never at runtime — the
 * runtime path is `DatabaseModule.forRootFromEnv()`). Entities come from
 * the single `DEXTER_PERSISTED_ENTITIES` registration point; migrations
 * resolve via `__dirname` (NOT cwd-relative) so the CLI works from
 * `apps/dexter-onchain-bot/` locally and from `/app` inside Docker.
 *
 * Invalid DATABASE_URL throws a readable error at import time (fail fast,
 * no hang). `synchronize` is ALWAYS false here — schema changes travel
 * exclusively via migrations outside dev/test auto-sync.
 */
export default new DataSource({
  type: 'postgres',
  host: parsed.host,
  port: parsed.port,
  username: parsed.username,
  password: parsed.password,
  database: parsed.database,
  entities: DEXTER_PERSISTED_ENTITIES,
  migrations: [__dirname + '/migrations/*.ts', __dirname + '/migrations/*.js'],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});

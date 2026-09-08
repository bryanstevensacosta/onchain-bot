import 'reflect-metadata';
import { register } from 'tsconfig-paths';
import { join, resolve } from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

// Register TypeScript path aliases for TypeORM CLI
// (mirrors apps/backend/src/shared/common/persistence/data-source.ts;
// alias set matches apps/ingestion-service/tsconfig.json — shared/*,
// telegram/*, stream/*, media/*, health/*, src/*)
register({
  baseUrl: resolve(__dirname, '../../../'),
  paths: {
    'shared/kernel/*': ['src/shared/kernel/*'],
    'shared/common/*': ['src/shared/common/*'],
    'shared/*': ['src/shared/*'],
    'telegram/*': ['src/telegram/*'],
    'stream/*': ['src/stream/*'],
    'media/*': ['src/media/*'],
    'health/*': ['src/health/*'],
    'src/*': ['src/*'],
  },
});

dotenv.config();

// Import entities after tsconfig-paths registration
import { CryptoNewsSourceEntity } from 'telegram/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { CryptoNewsMessageEntity } from 'telegram/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from 'telegram/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import { ChannelContentFilterConfigEntity } from 'telegram/crypto-news/infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';
import { BackfillMessageEntity } from 'stream/infrastructure/persistence/typeorm/backfill-message.entity';

/**
 * The 5 ingestion-owned tables (sole owner since 2026-09-05).
 * Must stay in sync with the `entities` array in `src/app.module.ts`.
 * Backend entities are NEVER listed here (split-brain ownership).
 */
export const INGESTION_PERSISTED_ENTITIES = [
  CryptoNewsSourceEntity,
  CryptoNewsMessageEntity,
  CryptoNewsMessageMediaEntity,
  ChannelContentFilterConfigEntity,
  BackfillMessageEntity,
];

export default new DataSource({
  type: 'postgres',
  host:
    process.env.INGESTION_DATABASE_HOST ||
    process.env.DATABASE_HOST ||
    'localhost',
  port: parseInt(
    process.env.INGESTION_DATABASE_PORT ||
      process.env.DATABASE_PORT ||
      '5432',
    10,
  ),
  username:
    process.env.INGESTION_DATABASE_USER ||
    process.env.DATABASE_USERNAME ||
    'postgres',
  password:
    process.env.INGESTION_DATABASE_PASSWORD ||
    process.env.DATABASE_PASSWORD ||
    'postgres',
  database:
    process.env.INGESTION_DATABASE_NAME ||
    process.env.DATABASE_NAME ||
    'onchain_bot',
  entities: INGESTION_PERSISTED_ENTITIES,
  migrations: [
    // __dirname-anchored (NOT cwd-relative like the backend glob) so the same
    // pattern resolves both under src/ (ts-node CLI) and under dist/
    // (compiled data-source.js + compiled migrations side by side).
    join(__dirname, 'migrations', '*.{ts,js}'),
  ],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});

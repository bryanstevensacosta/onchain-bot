import 'reflect-metadata';
import { register } from 'tsconfig-paths';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

// Register TypeScript path aliases for TypeORM CLI
register({
  baseUrl: resolve(__dirname, '../../../'),
  paths: {
    'shared/kernel/*': ['src/shared/kernel/*'],
    'shared/common/*': ['src/shared/common/*'],
    'shared/*': ['src/shared/*'],
    'discovery/*': ['src/discovery/*'],
    'chain/*': ['src/chain/*'],
    'token/*': ['src/token/*'],
    'telegram/*': ['src/telegram/*'],
    'kol/*': ['src/kol/*'],
    'settings/*': ['src/settings/*'],
    'dashboard/*': ['src/dashboard/*'],
    'data-provider/*': ['src/data-provider/*'],
    'health/*': ['src/health/*'],
    'src/*': ['src/*'],
  },
});

dotenv.config();

// Import entities after tsconfig-paths registration
import { PERSISTED_ENTITIES } from './entities';

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  username: process.env.POSTGRES_USER ?? 'alpha_meta_token_scanner',
  password: process.env.POSTGRES_PASSWORD ?? 'alpha_meta_token_scanner',
  database: process.env.POSTGRES_DB ?? 'alpha_meta_token_scanner',
  entities: PERSISTED_ENTITIES,
  // __dirname-based (NOT cwd-relative): the CLI runs from apps/backend
  // locally (src/…/*.ts) and from /app inside Docker (dist/backend/…/*.js).
  // The old cwd-relative 'src/…' glob matched nothing in Docker, so staging
  // and prod migration runs silently reported "No migrations are pending".
  migrations: [__dirname + '/migrations/*.ts', __dirname + '/migrations/*.js'],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});

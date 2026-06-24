import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  username: process.env.POSTGRES_USER ?? 'alpha_meta_token_scanner',
  password: process.env.POSTGRES_PASSWORD ?? 'alpha_meta_token_scanner',
  database: process.env.POSTGRES_DB ?? 'alpha_meta_token_scanner',
  entities: [],
  migrations: [
    'src/shared/common/persistence/migrations/*.ts',
    'src/shared/common/persistence/migrations/*.js',
  ],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});

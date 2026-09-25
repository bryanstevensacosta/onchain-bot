import { DataSource } from 'typeorm';
import { BotVaultOrmEntity } from '../../vault/infrastructure/bot-vault.orm-entity';

/**
 * Own-DB data source (`onchain_bot_bots[_staging]`, same server per env).
 * Migrations run explicitly (`migration:run`); dev/test use synchronize.
 */
export const BotsGatewayDataSource = new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/onchain_bot_bots',
  entities: [BotVaultOrmEntity],
  synchronize: false,
  migrationsRun: false,
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
});

export default BotsGatewayDataSource;

import { DataSource } from 'typeorm';
import { BotVaultOrmEntity } from '@/vault/infrastructure/bot-vault.orm-entity';

/**
 * Own-DB data source (`telegram_bots_db[_staging]`, same server per env).
 * Migrations run explicitly (`migration:run`); dev/test use synchronize.
 */
export const BotsGatewayDataSource = new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ??
    'postgres://onchain_bot:onchain_bot@localhost:5432/telegram_bots_db',
  entities: [BotVaultOrmEntity],
  synchronize: false,
  migrationsRun: false,
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
});

export default BotsGatewayDataSource;

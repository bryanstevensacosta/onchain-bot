import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramChannelEntity } from 'discovery/ingestion/telegram/infrastructure/persistence/typeorm/entities/telegram-channel.entity';
import { CanonicalTokenCallEntity } from 'discovery/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';
import { ChannelReputationStatsEntity } from 'discovery/analytics/infrastructure/persistence/typeorm/entities/channel-reputation-stats.entity';
import type { AppConfig } from 'shared/common/config/app.config';

const PERSISTED_ENTITIES = [
  TelegramChannelEntity,
  CanonicalTokenCallEntity,
  ChannelReputationStatsEntity,
];

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
            DatabaseModule.logger.log(
              `Postgres enabled (host=${cfg?.host}:${cfg?.port} db=${cfg?.database}, synchronize=${cfg?.synchronize}).`,
            );
            return {
              type: 'postgres' as const,
              host: cfg?.host ?? 'localhost',
              port: cfg?.port ?? 5432,
              username: cfg?.username ?? 'onchain',
              password: cfg?.password ?? 'onchain',
              database: cfg?.database ?? 'onchain_bot',
              entities: PERSISTED_ENTITIES,
              synchronize: cfg?.synchronize ?? true,
              logging: cfg?.logging ? 'all' : false,
              retryAttempts: 5,
              retryDelay: 2000,
            };
          },
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}

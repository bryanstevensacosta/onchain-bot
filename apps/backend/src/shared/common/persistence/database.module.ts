import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { CanonicalTokenCallEntity } from 'token/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';
import { KolReputationEntity } from 'kol/reputation/infrastructure/persistence/typeorm/entities/kol-reputation.entity';
import { TokenScoreEntity } from 'token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity';
import { TokenClassificationEntity } from 'token/classification/infrastructure/persistence/typeorm/entities/token-classification.entity';
import { CallPerformanceEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-performance.entity';
import { CallEvaluationJobEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-evaluation-job.entity';
import { FilterDecisionEntity } from 'token/token-gating/infrastructure/persistence/typeorm/entities/filter-decision.entity';
import { TokenSnapshotEntity } from 'chain/explorer/infrastructure/persistence/typeorm/entities/token-snapshot.entity';
import { ExtractionResultEntity } from 'token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity';
import { TokenCallEntity } from 'token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity';
import { HoneypotAnalysisEntity } from 'token/honeypot/infrastructure/persistence/typeorm/entities/honeypot-analysis.entity';
import { ChainDetectionResultEntity } from 'chain/detection/infrastructure/persistence/typeorm/entities/chain-detection-result.entity';
import { ChatGroupEntity } from 'telegram/chain-dexter-bot/domain/chat-group.entity';
import { ChatSettingsEntity } from 'telegram/chain-dexter-bot/domain/chat-settings.entity';
import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';
import { ScoringThresholdEntity } from 'settings/infrastructure/persistence/typeorm/entities/scoring-threshold.entity';
import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';
import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';
import type { AppConfig } from 'shared/common/config/app.config';

const PERSISTED_ENTITIES = [
  KolEntity,
  CanonicalTokenCallEntity,
  KolReputationEntity,
  TokenScoreEntity,
  TokenClassificationEntity,
  CallPerformanceEntity,
  CallEvaluationJobEntity,
  FilterDecisionEntity,
  TokenSnapshotEntity,
  ExtractionResultEntity,
  TokenCallEntity,
  HoneypotAnalysisEntity,
  ChainDetectionResultEntity,
  ChatGroupEntity,
  ChatSettingsEntity,
  SignalEntity,
  ScoringThresholdEntity,
  SettingsFilterEntity,
  SettingsAuditLogEntity,
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
              username: cfg?.username ?? 'alpha_meta_token_scanner',
              password: cfg?.password ?? 'alpha_meta_token_scanner',
              database: cfg?.database ?? 'alpha_meta_token_scanner',
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

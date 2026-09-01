import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { CanonicalTokenCallEntity } from 'token/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';
import { KolReputationEntity } from 'kol/reputation/infrastructure/persistence/typeorm/entities/kol-reputation.entity';
import { TokenScoreEntity } from 'token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity';
import { TokenClassificationEntity } from 'token/classification/infrastructure/persistence/typeorm/entities/token-classification.entity';
import { CallPerformanceEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-performance.entity';
import { CallEvaluationJobEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-evaluation-job.entity';
import { TrackedPublishedCallOrmEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/tracked-published-call.entity';
import { VipCallApprovalDecisionEntity } from 'token/vip-call-approval/infrastructure/persistence/typeorm/entities/vip-call-approval-decision.entity';
import { TokenSnapshotEntity } from 'token/enrichment/infrastructure/persistence/typeorm/entities/token-snapshot.entity';
import { ExtractionResultEntity } from 'token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity';
import { TokenCallEntity } from 'token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity';
import { HoneypotAnalysisEntity } from 'token/honeypot/infrastructure/persistence/typeorm/entities/honeypot-analysis.entity';
import { ChainDetectionResultEntity } from 'chain/detection/infrastructure/persistence/typeorm/entities/chain-detection-result.entity';
import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';
import { ScoringThresholdEntity } from 'settings/infrastructure/persistence/typeorm/entities/scoring-threshold.entity';
import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';
import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';
import { SettingsPresetEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-preset.entity';
import { AchievementThresholdEntity } from 'token/achievement/domain/entities/achievement-threshold.entity';
import { MonitoredCallEntity } from 'token/achievement/domain/entities/monitored-call.entity';
import { PublishedCallEntity } from 'telegram/vip-calls/vip-channel/infrastructure/persistence/typeorm/entities/published-call.entity';
import { VipAchievementEntity } from 'telegram/vip-calls/vip-achievement/infrastructure/persistence/typeorm/entities/vip-achievement.entity';
import { CryptoNewsSourceEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import { BlacklistPhraseEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity';
import { KeywordEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity';
import { LlmConfigEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/llm-config.entity';
import { PromptTemplateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity';
import { PublisherQueueEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity';
import { PublisherThrottleStateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-throttle-state.entity';
import { PublisherSlotStateEntity } from 'telegram/shared/infrastructure/persistence/typeorm/entities/publisher-slot-state.entity';
import { DedupRecordEntity } from 'shared/deduplication/infrastructure/persistence/typeorm/entities/dedup-record.entity';
import { AdEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad.entity';
import { AdRotationConfigEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-config.entity';
import { AdRotationStateEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-state.entity';
import { AdsThrottleStateEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ads-throttle-state.entity';
import { AdMediaEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-media.entity';
import { AdMediaLibraryEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-media-library.entity';

/**
 * All TypeORM entities persisted to Postgres. This array is consumed by
 * `DatabaseModule.forRootFromEnv()` and `data-source.ts` (TypeORM CLI).
 *
 * **IMPORTANT**: When adding a new entity:
 * 1. Import it above
 * 2. Add it to the PERSISTED_ENTITIES array below
 * 3. Update EXPECTED_ENTITY_COUNT
 * 4. Generate a migration: `npm run migration:generate -- -n AddYourEntity`
 */
export const PERSISTED_ENTITIES = [
  KolEntity,
  CanonicalTokenCallEntity,
  KolReputationEntity,
  TokenScoreEntity,
  TokenClassificationEntity,
  CallPerformanceEntity,
  CallEvaluationJobEntity,
  TrackedPublishedCallOrmEntity,
  VipCallApprovalDecisionEntity,
  TokenSnapshotEntity,
  ExtractionResultEntity,
  TokenCallEntity,
  HoneypotAnalysisEntity,
  ChainDetectionResultEntity,
  SignalEntity,
  ScoringThresholdEntity,
  SettingsFilterEntity,
  SettingsAuditLogEntity,
  SettingsPresetEntity,
  AchievementThresholdEntity,
  MonitoredCallEntity,
  PublishedCallEntity,
  VipAchievementEntity,
  CryptoNewsSourceEntity,
  CryptoNewsMessageEntity,
  CryptoNewsMessageMediaEntity,
  BlacklistPhraseEntity,
  KeywordEntity,
  LlmConfigEntity,
  PromptTemplateEntity,
  PublisherQueueEntity,
  PublisherThrottleStateEntity,
  PublisherSlotStateEntity,
  AdEntity,
  AdMediaEntity,
  AdRotationConfigEntity,
  AdRotationStateEntity,
  AdsThrottleStateEntity,
  AdMediaLibraryEntity,
  DedupRecordEntity,
];

/**
 * Expected entity count for validation. If this doesn't match
 * PERSISTED_ENTITIES.length, something is wrong.
 */
export const EXPECTED_ENTITY_COUNT = 40;

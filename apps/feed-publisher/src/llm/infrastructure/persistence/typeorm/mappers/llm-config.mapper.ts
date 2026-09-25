import { LlmConfig } from '../../../../domain/llm-config.entity';
import { LlmConfigOrmEntity } from '../llm-config.orm-entity';

/** Domain <-> TypeORM mapper for `LlmConfig` (unwired until GAP-1). */
export const toLlmConfigRow = (config: LlmConfig): LlmConfigOrmEntity => {
  const row = new LlmConfigOrmEntity();
  row.id = config.id;
  row.defaultTemplateId = config.defaultTemplateId;
  row.targetChannel = config.targetChannel;
  row.llmEnabled = config.llmEnabled;
  row.publishingEnabled = config.publishingEnabled;
  row.rejectNonLatin = config.rejectNonLatin;
  row.dailyCap = config.dailyCap;
  row.dailyResetUtcHour = config.dailyResetUtcHour;
  row.randomDelayMinMs = config.randomDelayMinMs;
  row.randomDelayMaxMs = config.randomDelayMaxMs;
  row.llmMaxAttempts = config.llmMaxAttempts;
  row.updatedAt = config.updatedAt;
  return row;
};

export const toLlmConfigDomain = (row: LlmConfigOrmEntity): LlmConfig =>
  LlmConfig.reconstitute({
    id: row.id,
    defaultTemplateId: row.defaultTemplateId,
    targetChannel: row.targetChannel,
    llmEnabled: row.llmEnabled,
    publishingEnabled: row.publishingEnabled,
    rejectNonLatin: row.rejectNonLatin,
    dailyCap: row.dailyCap,
    dailyResetUtcHour: row.dailyResetUtcHour,
    randomDelayMinMs: Number(row.randomDelayMinMs),
    randomDelayMaxMs: Number(row.randomDelayMaxMs),
    llmMaxAttempts: row.llmMaxAttempts,
    updatedAt: row.updatedAt,
  });

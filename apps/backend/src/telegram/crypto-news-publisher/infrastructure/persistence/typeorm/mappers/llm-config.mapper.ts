import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { LlmConfigEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/llm-config.entity';

/**
 * Maps between the domain aggregate `LlmConfig` and its anemic
 * TypeORM persistence shape `LlmConfigEntity`.
 */
export class LlmConfigMapper {
  public static toEntity(config: LlmConfig): LlmConfigEntity {
    const row = new LlmConfigEntity();
    row.id = config.id;
    row.defaultTemplateId = config.defaultTemplateId;
    row.targetChannel = config.targetChannel;
    row.enabled = config.enabled;
    row.rejectNonLatin = config.rejectNonLatin ?? true;
    row.dailyCap = config.dailyCap;
    row.dailyResetUtcHour = config.dailyResetUtcHour;
    row.randomDelayMinMs = config.randomDelayMinMs;
    row.randomDelayMaxMs = config.randomDelayMaxMs;
    row.llmMaxAttempts = config.llmMaxAttempts;
    row.updatedAt = config.updatedAt;
    return row;
  }

  public static toDomain(row: LlmConfigEntity): LlmConfig {
    return LlmConfig.reconstitute({
      id: row.id,
      defaultTemplateId: row.defaultTemplateId,
      targetChannel: row.targetChannel,
      enabled: row.enabled,
      rejectNonLatin: row.rejectNonLatin ?? true,
      dailyCap: row.dailyCap,
      dailyResetUtcHour: row.dailyResetUtcHour,
      randomDelayMinMs: row.randomDelayMinMs,
      randomDelayMaxMs: row.randomDelayMaxMs,
      llmMaxAttempts: row.llmMaxAttempts,
      updatedAt: row.updatedAt,
    });
  }
}

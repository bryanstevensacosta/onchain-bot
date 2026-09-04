import { Injectable, Logger } from '@nestjs/common';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';

/**
 * Provides the LLM model name for deduplication arbiter by querying
 * the crypto-news publisher's default template from the database.
 *
 * This ensures consistency — both the publisher and the deduplication
 * arbiter use the same LLM model as configured in the DB.
 *
 * Fail-open behavior: If DB query fails or template is not found,
 * falls back to env var `DEDUP_LLM_MODEL` or gateway default.
 */
@Injectable()
export class LlmModelProviderService {
  private readonly logger = new Logger(LlmModelProviderService.name);
  private cachedModel: string | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 60_000; // 1 minute cache

  constructor(
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly promptTemplateRepo: PromptTemplateRepository,
  ) {}

  /**
   * Get the LLM model name from DB (cached for 1 minute).
   * Returns undefined if DB query fails (caller falls back to env/default).
   */
  async getModel(): Promise<string | undefined> {
    const now = Date.now();
    if (this.cachedModel && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cachedModel;
    }

    try {
      const config = await this.llmConfigRepo.load();
      const template = await this.promptTemplateRepo.findById(
        config.defaultTemplateId,
      );

      if (!template) {
        this.logger.warn(
          `Default template ${config.defaultTemplateId} not found, falling back to env/default model`,
        );
        return undefined;
      }

      this.cachedModel = template.model;
      this.lastFetchTime = now;
      this.logger.log(
        `Using crypto-news publisher model for dedup arbiter: ${this.cachedModel}`,
      );
      return this.cachedModel;
    } catch (error) {
      this.logger.error(
        `Failed to load LLM model from DB: ${(error as Error).message}`,
      );
      return undefined;
    }
  }
}

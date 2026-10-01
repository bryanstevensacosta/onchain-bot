import type { LlmConfig } from '../llm-config.entity';

/**
 * Outbound port: persistence for the single-row `LlmConfig` (`id = 1`).
 * TypeORM adapter lands with the persistence todo (GAP-1); the
 * in-memory adapter is the live binding until then.
 */
export abstract class LlmConfigRepository {
  public abstract load(): Promise<LlmConfig>;
  public abstract save(config: LlmConfig): Promise<LlmConfig>;
}

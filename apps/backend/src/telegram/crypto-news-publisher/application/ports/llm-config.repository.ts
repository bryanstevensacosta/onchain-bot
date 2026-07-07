import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';

/**
 * Outbound port: persistence for the single-row crypto-news LLM
 * publishing config.
 *
 * The table is intentionally a one-row table (always `id = 1`) so
 * the contract is simpler than a generic repository:
 *
 *   - `load()` returns the only row, or THROWS if it is missing.
 *     The migration service guarantees a row exists by the time
 *     other code runs (`LlmConfigMigrationService.onApplicationBootstrap`).
 *     If the migration was skipped or failed, the cron publisher
 *     fails fast with a clear error rather than silently using
 *     empty/zero values.
 *   - `save(config)` upserts the single row. The migration service
 *     uses this on first boot; the future `PATCH /llm/config`
 *     endpoint will use it for operator edits (T2).
 *
 * Read paths elsewhere (T2 adapter) will call `load()` at every
 * use site so a `PATCH` propagates without restart.
 */
export abstract class LlmConfigRepository {
  public abstract load(): Promise<LlmConfig>;
  public abstract save(config: LlmConfig): Promise<LlmConfig>;
}

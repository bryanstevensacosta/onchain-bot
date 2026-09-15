import { ThreadsLlmConfig } from 'threads/publisher/domain/entities/threads-llm-config.entity';

/**
 * Outbound port: single-row Threads LLM/publishing config.
 *
 * Threads-typed mirror of the crypto-news `LlmConfigRepository`
 * `load()` shape. Exactly one row exists (`id = 1`); when no row
 * exists yet the implementation returns seed defaults (dailyCap 60,
 * throttle 60s–300s, llmMaxAttempts 3, both flags off).
 *
 * `save(config)` upserts the single row — the `PATCH
 * /threads-publisher/llm/config` endpoint (T4) uses it for operator
 * edits. Read paths call `load()` at every use site so a `PATCH`
 * propagates without restart.
 */
export abstract class ThreadsLlmConfigRepository {
  public abstract load(): Promise<ThreadsLlmConfig>;
  public abstract save(config: ThreadsLlmConfig): Promise<ThreadsLlmConfig>;
}

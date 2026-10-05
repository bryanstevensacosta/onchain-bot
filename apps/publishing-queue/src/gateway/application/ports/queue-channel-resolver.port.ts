/**
 * Gateway-side queue channel resolver (R-b1).
 *
 * Thin env-only lookup (`CRYPTO_NEWS_OUTPUT_CHANNEL` /
 * `THREADS_OUTPUT_CHANNEL`): the DB-first resolution (`LlmConfig`
 * `targetChannel`) is llm decision logic and stays in feed-publisher
 * per R6. The queue drain only needs a channel to address; the llm
 * half (todo 5) reintroduces DB resolution without touching callers.
 */
export abstract class QueueChannelResolverPort {
  public abstract resolveChannel(
    contentType: string,
  ): Promise<string | null>;
}

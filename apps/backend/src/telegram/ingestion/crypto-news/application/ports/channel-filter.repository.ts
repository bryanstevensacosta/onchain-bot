/**
 * Rule defining a regex-based content filter.
 * Lower priority value = higher precedence (applied first).
 */
export interface ChannelFilterRule {
  /** Regex pattern string to match */
  pattern: string;
  /** Replacement string (supports $1, $2, etc. for capture groups) */
  replacement: string;
  /** Regex flags (e.g., 'gi', 'g', 'i') */
  flags: string;
  /** Priority: lower value = higher precedence (applied first) */
  priority: number;
  /** Whether this filter is active */
  isActive: boolean;
  /** Creation timestamp for deterministic tie-breaking (priority ASC, createdAt ASC) */
  createdAt: Date;
}

/**
 * Outbound port: read-only access to per-channel content filter rules.
 *
 * Filters-only slice of the legacy `CryptoNewsSourceRepository`
 * (db-separation todo 4): crypto-news sources/messages/media moved to
 * ingestion-service's own DB, while `channel_content_filter_configs`
 * STAYS in the backend with `channel_id` as an opaque varchar (no FK).
 * Consumers needing filter rules (e.g. `FilteredCryptoNewsService`)
 * depend on this port instead of the source repository.
 */
export abstract class ChannelFilterRepository {
  /**
   * Fetch all active filter rules for a channel, ordered by
   * priority ASC then createdAt ASC for deterministic execution.
   * Returns [] when the channel has no rules (unknown channels are
   * NOT an error — sources live in ingestion-service).
   */
  public abstract findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<ChannelFilterRule>>;
}

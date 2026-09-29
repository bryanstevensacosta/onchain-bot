/**
 * @deprecated Moved to apps/feed-publisher/src/ingestion/ + apps/feed-publisher/src/matching/ (Tramo 2, todos 2+3 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add feed ingestion/matching logic in apps/feed-publisher/src/ingestion/ or apps/feed-publisher/src/matching/ instead.
 */
import { MatchingConfig } from 'telegram/crypto-news-integration/domain/entities/matching-config.entity';

export interface MatchingConfigView {
  readonly id: number;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export const toMatchingConfigView = (
  config: MatchingConfig,
): MatchingConfigView => ({
  id: config.id,
  enabled: config.enabled,
  updatedAt: config.updatedAt.toISOString(),
});

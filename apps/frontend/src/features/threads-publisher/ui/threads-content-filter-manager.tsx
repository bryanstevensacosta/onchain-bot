import { ContentFilterManager } from '@/features/crypto-news-filters/ui/content-filter-manager';
import { ThreadsSection } from './threads-section';

/**
 * Threads content-filter block — thin wrapper, NOT an as-is clone.
 * Content filters are SHARED backend data (same routes, same rows for
 * both products), so the inner manager is reused by import; `basePath`
 * + `queryKeys` are injected so the block stays backend-agnostic and
 * refresh-scoped like every other threads wrapper.
 */
export interface ThreadsContentFilterManagerProps {
  basePath: string;
  queryKeys: readonly unknown[];
  channelId: string;
}

export function ThreadsContentFilterManager({
  basePath,
  queryKeys,
  channelId,
}: ThreadsContentFilterManagerProps): React.ReactElement {
  return (
    <ThreadsSection
      basePath={basePath}
      queryKeys={queryKeys}
      title="Content Filters"
    >
      <ContentFilterManager channelId={channelId} />
    </ThreadsSection>
  );
}

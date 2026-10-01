/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (Tramo 2, todo 8 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add threads logic in apps/feed-publisher/src/threads/ instead.
 */
import { ThreadsMatchingConfig } from 'threads/integration/domain/entities/threads-matching-config.entity';

export interface ThreadsMatchingConfigView {
  readonly id: number;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

/**
 * Mirror of crypto `toMatchingConfigView` — domain → HTTP view.
 */
export const toThreadsMatchingConfigView = (
  config: ThreadsMatchingConfig,
): ThreadsMatchingConfigView => ({
  id: config.id,
  enabled: config.enabled,
  updatedAt: config.updatedAt.toISOString(),
});

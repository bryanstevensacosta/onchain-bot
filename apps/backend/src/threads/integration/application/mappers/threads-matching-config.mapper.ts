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

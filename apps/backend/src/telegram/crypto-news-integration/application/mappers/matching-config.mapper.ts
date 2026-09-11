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

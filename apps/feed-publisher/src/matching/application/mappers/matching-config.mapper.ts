import { MatchingConfig } from '../../domain/matching-config.entity';

export interface MatchingConfigView {
  readonly id: number;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export function toMatchingConfigView(
  config: MatchingConfig,
): MatchingConfigView {
  return {
    id: config.id,
    enabled: config.enabled,
    updatedAt: config.updatedAt.toISOString(),
  };
}

import { MatchingConfig } from '../matching-config.entity';

/**
 * Port: read/write the single-row MatchingConfig (id = 1).
 * Seeds disabled on first boot (fail-closed).
 */
export abstract class MatchingConfigRepository {
  public abstract load(): Promise<MatchingConfig>;
  public abstract save(config: MatchingConfig): Promise<void>;
}

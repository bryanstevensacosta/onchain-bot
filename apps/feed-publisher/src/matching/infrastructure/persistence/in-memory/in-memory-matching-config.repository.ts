import { Injectable } from '@nestjs/common';
import { MatchingConfig } from '@/matching/domain/matching-config.entity';
import { MatchingConfigRepository } from '@/matching/domain/ports/matching-config.repository';

/**
 * In-memory `MatchingConfigRepository` — the LIVE binding until GAP-1.
 * Seeds disabled on first load (fail-closed, mirrors the backend).
 */
@Injectable()
export class InMemoryMatchingConfigRepository extends MatchingConfigRepository {
  private current: MatchingConfig | null = null;

  public async load(): Promise<MatchingConfig> {
    if (!this.current) {
      this.current = MatchingConfig.load({});
    }
    return this.current;
  }

  public async save(config: MatchingConfig): Promise<void> {
    this.current = config;
  }
}

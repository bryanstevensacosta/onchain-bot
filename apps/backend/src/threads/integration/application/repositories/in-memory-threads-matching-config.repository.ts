import { Injectable } from '@nestjs/common';
import { ThreadsMatchingConfig } from 'threads/integration/domain/entities/threads-matching-config.entity';
import { ThreadsMatchingConfigRepository } from 'threads/integration/application/ports/threads-matching-config.repository';

/**
 * In-memory `ThreadsMatchingConfigRepository` for specs.
 *
 * Holds the single row (id = 1) in memory, seeded `enabled = true`
 * per the T5 contract (fail-open so a fresh pipeline enqueues
 * immediately — the crypto mirror seeds `false`).
 */
@Injectable()
export class InMemoryThreadsMatchingConfigRepository extends ThreadsMatchingConfigRepository {
  private config: ThreadsMatchingConfig = ThreadsMatchingConfig.load({
    id: 1,
    enabled: true,
    updatedAt: new Date(),
  });

  /** Test helper: flip flags without going through the controller. */
  public seed(patch: { enabled?: boolean }): void {
    this.config.update(patch);
  }

  public async load(): Promise<ThreadsMatchingConfig> {
    return this.config;
  }

  public async save(config: ThreadsMatchingConfig): Promise<void> {
    this.config = config;
  }
}

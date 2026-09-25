import { Injectable } from '@nestjs/common';
import { SchedulingConfig } from '../../../domain/scheduling-config.entity';
import { SchedulingConfigRepository } from '../../../domain/ports/scheduling-config.repository';

/**
 * In-memory `SchedulingConfigRepository` — the LIVE binding until
 * GAP-1. Seeds fail-closed (`enabled = false`) with per-target
 * P38 defaults from env (publish delay + daily cap each).
 */
@Injectable()
export class InMemorySchedulingConfigRepository extends SchedulingConfigRepository {
  private current: SchedulingConfig | null = null;

  public async load(): Promise<SchedulingConfig> {
    if (!this.current) {
      this.current = SchedulingConfig.load({});
    }
    return this.current;
  }

  public async save(config: SchedulingConfig): Promise<void> {
    this.current = config;
  }
}

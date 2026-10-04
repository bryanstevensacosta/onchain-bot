import { SchedulingConfig } from '../scheduling-config.entity';

/** Outbound port: single-row scheduling rotation config. */
export abstract class SchedulingConfigRepository {
  public abstract load(): Promise<SchedulingConfig>;
  public abstract save(config: SchedulingConfig): Promise<void>;
}

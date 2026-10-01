import { SchedulingState } from '../scheduling-state.entity';

/** Outbound port: single-row scheduling rotation state. */
export abstract class SchedulingStateRepository {
  public abstract load(): Promise<SchedulingState>;
  public abstract save(state: SchedulingState): Promise<void>;
  public abstract resetPostsSinceLastAd(): Promise<void>;
  public abstract markPublished(
    target: 'telegram' | 'threads',
    adId: string,
    at: Date,
  ): Promise<void>;
}

import { CallPerformance } from 'discovery/analytics/domain/value-objects/call-performance.vo';

export abstract class CallPerformanceRepository {
  public abstract save(perf: CallPerformance): Promise<void>;
  public abstract findByChannel(
    channelId: string,
  ): Promise<ReadonlyArray<CallPerformance>>;
  public abstract findByToken(
    tokenId: string,
  ): Promise<ReadonlyArray<CallPerformance>>;
  public abstract findAll(): Promise<ReadonlyArray<CallPerformance>>;
}

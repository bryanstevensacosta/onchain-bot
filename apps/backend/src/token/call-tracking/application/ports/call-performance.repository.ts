import { CallPerformance } from 'token/call-tracking/domain/value-objects/call-performance.vo';

export abstract class CallPerformanceRepository {
  public abstract save(perf: CallPerformance): Promise<void>;
  public abstract findByChannel(
    kolId: string,
  ): Promise<ReadonlyArray<CallPerformance>>;
  public abstract findByToken(
    tokenId: string,
  ): Promise<ReadonlyArray<CallPerformance>>;
  public abstract findAll(): Promise<ReadonlyArray<CallPerformance>>;
}

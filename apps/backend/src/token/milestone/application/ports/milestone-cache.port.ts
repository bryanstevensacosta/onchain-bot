export abstract class MilestoneCachePort {
  abstract getNotifiedThresholds(callId: string): Promise<Set<number>>;
  abstract addNotifiedThreshold(
    callId: string,
    threshold: number,
  ): Promise<void>;
  abstract invalidateCall(callId: string): Promise<void>;
}

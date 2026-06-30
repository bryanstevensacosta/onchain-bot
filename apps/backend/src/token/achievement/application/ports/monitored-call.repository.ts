export interface MonitoredCallRecord {
  id?: string;
  callId: string;
  chain: string;
  address: string;
  mcAtCall: number;
  publishedAt: Date;
  lastEvaluatedAt?: Date | null;
}

export abstract class MonitoredCallRepository {
  abstract findByChainAndAddress(
    chain: string,
    address: string,
  ): Promise<MonitoredCallRecord | null>;
  abstract findByCallId(callId: string): Promise<MonitoredCallRecord | null>;
  abstract findActive(
    maxAgeMs: number,
    limit: number,
  ): Promise<MonitoredCallRecord[]>;
  abstract save(call: MonitoredCallRecord): Promise<MonitoredCallRecord>;
  abstract updateLastEvaluated(id: string, at: Date): Promise<void>;
  abstract deactivate(id: string): Promise<void>;
}

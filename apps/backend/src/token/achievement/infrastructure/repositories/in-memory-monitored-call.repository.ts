import { Injectable } from '@nestjs/common';
import { Uuid } from 'shared/common/utils';
import {
  MonitoredCallRepository,
  MonitoredCallRecord,
} from '../../application/ports/monitored-call.repository';

@Injectable()
export class InMemoryMonitoredCallRepository extends MonitoredCallRepository {
  private store: Map<string, MonitoredCallRecord> = new Map();

  async findByChainAndAddress(
    chain: string,
    address: string,
  ): Promise<MonitoredCallRecord | null> {
    const normalized = address.toLowerCase();
    for (const r of this.store.values()) {
      if (r.chain === chain && r.address.toLowerCase() === normalized) {
        return r;
      }
    }
    return null;
  }

  async findByCallId(callId: string): Promise<MonitoredCallRecord | null> {
    return this.store.get(callId) ?? null;
  }

  async findActive(
    maxAgeMs: number,
    limit: number,
  ): Promise<MonitoredCallRecord[]> {
    const cutoff = Date.now() - maxAgeMs;
    const out: MonitoredCallRecord[] = [];
    for (const r of this.store.values()) {
      if (r.publishedAt.getTime() >= cutoff) {
        out.push(r);
      }
      if (out.length >= limit) break;
    }
    return out.sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
    );
  }

  async save(call: MonitoredCallRecord): Promise<MonitoredCallRecord> {
    const id = call.id ?? Uuid.v4();
    const saved: MonitoredCallRecord = { ...call, id };
    this.store.set(call.callId, saved);
    return saved;
  }

  async updateLastEvaluated(id: string, at: Date): Promise<void> {
    for (const r of this.store.values()) {
      if (r.id === id) {
        r.lastEvaluatedAt = at;
        return;
      }
    }
  }

  async deactivate(id: string): Promise<void> {
    for (const [k, v] of this.store.entries()) {
      if (v.id === id) {
        this.store.delete(k);
        return;
      }
    }
  }
}

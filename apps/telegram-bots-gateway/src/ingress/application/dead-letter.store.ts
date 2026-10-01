import { Injectable } from '@nestjs/common';

export interface DeadLetterRecord {
  readonly botId: string;
  readonly appId: string;
  readonly updateId: number | null;
  readonly payload: unknown;
  readonly attempts: number;
  readonly lastError: string;
  readonly at: string;
}

/**
 * In-memory dead-letter store (todo 3): updates that exhausted all
 * fan-out retries land here for operator replay (todo 7 persists it).
 */
@Injectable()
export class DeadLetterStore {
  private readonly records: DeadLetterRecord[] = [];

  public append(record: DeadLetterRecord): DeadLetterRecord {
    this.records.push(record);
    return record;
  }

  public list(botId?: string): DeadLetterRecord[] {
    if (!botId) return [...this.records];
    return this.records.filter((r) => r.botId === botId);
  }

  public count(botId?: string): number {
    return this.list(botId).length;
  }

  public clear(botId?: string): void {
    if (!botId) {
      this.records.length = 0;
      return;
    }
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      if (this.records[i].botId === botId) this.records.splice(i, 1);
    }
  }
}

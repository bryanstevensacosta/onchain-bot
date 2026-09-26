export interface UsageAuditEntry {
  readonly at: string;
  readonly keyId: string;
  readonly provider: string;
  readonly model: string;
  readonly promptChars: number;
  readonly outputChars: number;
  readonly latencyMs: number;
  readonly status: 'ok' | 'error';
}

/**
 * In-memory LLM usage audit ring (ai-ml, todo 0): one entry per
 * generation (who/when/provider/model/sizes/latency/status).
 * Prompts and outputs are NEVER stored — only sizes. Bounded
 * (drop-oldest) so provider traffic cannot grow memory without bound.
 * TypeORM persistence reuses this shape (todo 1+).
 */
export class UsageAuditService {
  private readonly entries: UsageAuditEntry[] = [];

  public constructor(private readonly capacity = 5000) {}

  public record(entry: Omit<UsageAuditEntry, 'at'>): void {
    this.entries.push({ ...entry, at: new Date().toISOString() });
    while (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  public list(): ReadonlyArray<UsageAuditEntry> {
    return [...this.entries];
  }

  public size(): number {
    return this.entries.length;
  }
}

export interface AccessAuditEntry {
  readonly at: string;
  readonly keyId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

/**
 * In-memory access audit ring (ai-ml, todo 0).
 *
 * Records every guard decision (who/when/endpoint/status) with key ids
 * only — key material, hashes, and query strings never enter the audit
 * log, application logs, responses, or errors. Bounded (drop-oldest)
 * so a hot loop cannot grow memory without bound.
 */
export class AccessAuditService {
  private readonly entries: AccessAuditEntry[] = [];

  public constructor(private readonly capacity = 1000) {}

  public record(entry: Omit<AccessAuditEntry, 'at'>): void {
    this.entries.push({ ...entry, at: new Date().toISOString() });
    while (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  public list(): ReadonlyArray<AccessAuditEntry> {
    return [...this.entries];
  }

  public size(): number {
    return this.entries.length;
  }
}

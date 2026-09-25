import { Inject, Injectable, Optional } from '@nestjs/common';

export interface AuditEntryInput {
  readonly keyId: string;
  readonly keyName: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

export interface AuditEntry extends AuditEntryInput {
  readonly at: string;
}

/**
 * Access audit log (Tramo 3, todo 10, P46).
 *
 * Records who (key id + name) / when / endpoint + status. NEVER stores
 * key material, hashes, or query strings — `path` is stripped of `?…`.
 */
@Injectable()
export class AccessAuditService {
  private readonly entries: AuditEntry[] = [];

  public constructor(@Optional() @Inject('ACCESS_AUDIT_MAX_ENTRIES') maxEntries?: number) {
    this.maxEntries = maxEntries ?? 1000;
  }

  private readonly maxEntries: number;

  public record(input: AuditEntryInput): void {
    const cleanPath = input.path.split('?')[0] ?? input.path;
    this.entries.push({ ...input, path: cleanPath, at: new Date().toISOString() });
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  public list(): AuditEntry[] {
    return [...this.entries];
  }

  public clear(): void {
    this.entries.length = 0;
  }
}

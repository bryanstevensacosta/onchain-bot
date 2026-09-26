import { Injectable } from '@nestjs/common';
import type { PublishTarget } from '../../../template/domain/template-target';

export type PublishAuditResult = 'published' | 'blocked' | 'rate-limited';

export interface PublishAuditEntry {
  readonly seq: number;
  readonly at: string;
  readonly sessionId: string;
  readonly target: PublishTarget;
  readonly botId: string;
  readonly chatId: string;
  readonly mode: 'llm' | 'raw';
  readonly result: PublishAuditResult;
  readonly reason?: string;
}

/**
 * Publish audit log (Tramo 2, todo 14, P50).
 *
 * Append-only record of every explicit publish attempt — published,
 * blocked (403), and rate-limited (429). Entries carry routing facts
 * ONLY (session/target/bot/chat/mode/result): tokens and ciphertext
 * NEVER enter this log (pinned by spec: serialized entries must not
 * match /token|ciphertext/). Served read-only at GET /api/publish-audit.
 */
@Injectable()
export class PublishAuditLog {
  private readonly entries: PublishAuditEntry[] = [];
  private nextSeq = 1;

  public append(
    input: Omit<PublishAuditEntry, 'seq' | 'at'>,
  ): PublishAuditEntry {
    const entry: PublishAuditEntry = {
      ...input,
      seq: this.nextSeq,
      at: new Date().toISOString(),
    };
    this.nextSeq += 1;
    this.entries.push(entry);
    return entry;
  }

  public list(): ReadonlyArray<PublishAuditEntry> {
    return [...this.entries];
  }

  public clear(): void {
    this.entries.length = 0;
    this.nextSeq = 1;
  }
}

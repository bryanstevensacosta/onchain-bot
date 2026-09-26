import { Injectable } from '@nestjs/common';

export type PublishAuditAction = 'publish' | 'manual' | 'blocked' | 'denied';

export interface PublishAuditInput {
  readonly actor: string;
  readonly action: PublishAuditAction;
  readonly templateId: string;
  readonly mentionId?: string;
  readonly channelTarget?: string | null;
  readonly reason?: string | null;
}

export interface PublishAuditEntry extends PublishAuditInput {
  readonly at: string;
}

/**
 * In-memory publish audit log (Tramo 1, todo 23, P50).
 *
 * Records who/what/where for every publish attempt: successes, blocked
 * (unverified/unconfigured/rejected) and denied (foreign/missing binding).
 * The entry shape carries NO tokens, NO api keys, NO ciphertext by
 * construction — only ids, targets and reason codes. TypeORM persistence
 * lands with the persistence todo (same kol-system DB).
 */
@Injectable()
export class PublishAuditLogService {
  private readonly entries: PublishAuditEntry[] = [];

  public record(input: PublishAuditInput): PublishAuditEntry {
    const entry: PublishAuditEntry = {
      actor: input.actor,
      action: input.action,
      templateId: input.templateId,
      mentionId: input.mentionId,
      channelTarget: input.channelTarget ?? null,
      reason: input.reason ?? null,
      at: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  public findRecent(limit = 50): PublishAuditEntry[] {
    const safe = Math.max(1, Math.min(500, Math.floor(limit) || 50));
    return this.entries.slice(-safe).reverse();
  }

  public count(): number {
    return this.entries.length;
  }
}

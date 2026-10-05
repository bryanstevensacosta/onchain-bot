/**
 * Gateway-side dedup probe port (R-b1).
 *
 * Same class name + method surface as the feed-publisher
 * `DeduplicationService`, but NONE of the decision logic moves here:
 * no exact/content/semantic cascade, no normalizers, no scorers, no
 * embeddings. Those stay in feed-publisher per R6. The live binding
 * below is fail-open (never blocks); the B1 dual binds a thin HTTP
 * probe against the feed-publisher owner.
 */
export interface DedupProbeReference {
  readonly channelId: string;
  readonly messageId: number;
  readonly entryId?: string | null;
}

export interface DedupProbeResult {
  readonly isDuplicate: boolean;
  readonly blockedReason?: string | null;
  readonly duplicateOf?: DedupProbeReference | null;
}

export abstract class DeduplicationService {
  public abstract checkDuplicate(input: {
    readonly source: string;
    readonly channelId: string;
    readonly messageId: number;
    readonly content: string;
  }): Promise<DedupProbeResult>;

  public abstract markAsSeen(input: {
    readonly source: string;
    readonly channelId: string;
    readonly messageId: number;
    readonly content: string;
    readonly entryId: string;
  }): Promise<void>;
}

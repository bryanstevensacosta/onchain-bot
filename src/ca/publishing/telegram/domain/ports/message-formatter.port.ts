export interface ApprovedCallInput {
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly score: number;
  readonly classification: string;
  readonly marketCapUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly holders: number | null;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly chart: string | null;
}

/**
 * Format an approved token call into a Telegram-friendly message string.
 *
 * v1 uses a fixed template. v2 will support per-channel templates and
 * markdown variants.
 */
export abstract class MessageFormatterPort {
  public abstract format(input: ApprovedCallInput): string;
}

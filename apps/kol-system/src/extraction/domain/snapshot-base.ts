/**
 * P26 snapshot base emitted per extraction toward enrichment.
 *
 * One base per mention (contract x mention): `occurred_at_telegram` is the
 * Telegram capture time (`occurredAt`), `ingested_at_kol` is stamped at
 * extraction time. `enriched_at` is ABSENT by design — enrichment sets it
 * later when market data is attached (the row then lives in the planned
 * `src/snapshot/` `mention_snapshots` table, P27, same DB).
 */
export interface ExtractionSnapshotBase {
  readonly mentionId: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly contractAddress: string;
  readonly chainHint: 'evm' | 'solana' | 'unknown';
  readonly occurred_at_telegram: Date;
  readonly ingested_at_kol: Date;
}

import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainEvent } from '../../../shared/kernel/domain-event';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';

export interface MentionSnapshotProps {
  readonly mentionId: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly contractIndex: number;
  readonly contractAddress: string;
  readonly chain: string;
  readonly occurred_at_telegram: Date;
  readonly ingested_at_kol: Date;
  readonly enriched_at: Date;
  readonly priceUsd?: number | null;
  readonly liquidityUsd?: number | null;
  readonly volume24hUsd?: number | null;
  readonly marketCapUsd?: number | null;
  readonly fdvUsd?: number | null;
  readonly priceChange24h?: number | null;
  readonly holders?: number | null;
  readonly top10HolderPercent?: number | null;
  readonly symbol?: string | null;
  readonly name?: string | null;
  readonly lockedLiquidityPercent?: number | null;
  readonly burnedPercent?: number | null;
}

/**
 * One completed snapshot per KOL mention (P26, owned by `src/snapshot/`,
 * P27: same kol-system DB as the mention index).
 *
 * Timestamps: `occurred_at_telegram` (capture in ingestion-telegram),
 * `ingested_at_kol` (extraction time), `enriched_at` (set by enrichment
 * when market data is attached). `snapshot_at` IS `enriched_at` (same
 * instant, second accessor) — the "mc at" market fields are the values AT
 * that instant. Performance compares vs the LAST snapshot of
 * (caller, contract).
 *
 * Pure-data aggregate (like `NormalizedMention`): `mutate` is a no-op;
 * persistence goes through the repository port, never direct DB.
 */
export class MentionSnapshot extends AggregateRoot<string> {
  private constructor(
    id: string,
    private readonly props: Required<MentionSnapshotProps>,
  ) {
    super(id);
  }

  public static create(input: MentionSnapshotProps): MentionSnapshot {
    if (!input.mentionId) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'mentionId must not be empty',
      );
    }
    if (!(input.occurred_at_telegram instanceof Date)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'occurred_at_telegram must be a Date',
        { mentionId: input.mentionId },
      );
    }
    if (!(input.ingested_at_kol instanceof Date)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ingested_at_kol must be a Date',
        { mentionId: input.mentionId },
      );
    }
    if (!(input.enriched_at instanceof Date)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'enriched_at must be a Date (snapshot_at derives from it)',
        { mentionId: input.mentionId },
      );
    }
    return new MentionSnapshot(input.mentionId, {
      mentionId: input.mentionId,
      kolId: input.kolId,
      messageId: input.messageId,
      contractIndex: input.contractIndex,
      contractAddress: input.contractAddress,
      chain: input.chain,
      occurred_at_telegram: input.occurred_at_telegram,
      ingested_at_kol: input.ingested_at_kol,
      enriched_at: input.enriched_at,
      priceUsd: input.priceUsd ?? null,
      liquidityUsd: input.liquidityUsd ?? null,
      volume24hUsd: input.volume24hUsd ?? null,
      marketCapUsd: input.marketCapUsd ?? null,
      fdvUsd: input.fdvUsd ?? null,
      priceChange24h: input.priceChange24h ?? null,
      holders: input.holders ?? null,
      top10HolderPercent: input.top10HolderPercent ?? null,
      symbol: input.symbol ?? null,
      name: input.name ?? null,
      lockedLiquidityPercent: input.lockedLiquidityPercent ?? null,
      burnedPercent: input.burnedPercent ?? null,
    });
  }

  public get mentionId(): string {
    return this.props.mentionId;
  }

  public get kolId(): string {
    return this.props.kolId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get contractIndex(): number {
    return this.props.contractIndex;
  }

  public get contractAddress(): string {
    return this.props.contractAddress;
  }

  public get chain(): string {
    return this.props.chain;
  }

  public get occurred_at_telegram(): Date {
    return this.props.occurred_at_telegram;
  }

  public get ingested_at_kol(): Date {
    return this.props.ingested_at_kol;
  }

  public get enriched_at(): Date {
    return this.props.enriched_at;
  }

  /** `snapshot_at` = `enriched_at` (P26: same instant, second accessor). */
  public get snapshot_at(): Date {
    return this.props.enriched_at;
  }

  public get priceUsd(): number | null {
    return this.props.priceUsd;
  }

  public get liquidityUsd(): number | null {
    return this.props.liquidityUsd;
  }

  public get volume24hUsd(): number | null {
    return this.props.volume24hUsd;
  }

  public get marketCapUsd(): number | null {
    return this.props.marketCapUsd;
  }

  public get fdvUsd(): number | null {
    return this.props.fdvUsd;
  }

  public get priceChange24h(): number | null {
    return this.props.priceChange24h;
  }

  public get holders(): number | null {
    return this.props.holders;
  }

  public get top10HolderPercent(): number | null {
    return this.props.top10HolderPercent;
  }

  public get symbol(): string | null {
    return this.props.symbol;
  }

  public get name(): string | null {
    return this.props.name;
  }

  public get lockedLiquidityPercent(): number | null {
    return this.props.lockedLiquidityPercent;
  }

  public get burnedPercent(): number | null {
    return this.props.burnedPercent;
  }

  /** True when at least one market field resolved (else the row is kept with nulls). */
  public hasMarketData(): boolean {
    return (
      this.props.priceUsd !== null ||
      this.props.marketCapUsd !== null ||
      this.props.liquidityUsd !== null
    );
  }

  protected mutate(_event: DomainEvent): void {
    // Pure-data aggregate: no state transitions from events.
  }
}

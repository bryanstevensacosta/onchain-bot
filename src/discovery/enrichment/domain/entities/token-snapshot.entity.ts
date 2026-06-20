import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { Pair } from 'discovery/enrichment/domain/value-objects/pair.vo';
import { TokenEnrichedEvent } from 'discovery/enrichment/domain/events/token-enriched.event';

export interface SnapshotInput {
  readonly chain: ChainId;
  readonly address: string;
  readonly pairs: ReadonlyArray<Pair>;
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly sources: ReadonlyArray<string>;
}

interface TokenSnapshotProps {
  readonly chain: ChainId;
  readonly address: string;
  readonly pairs: ReadonlyArray<Pair>;
  readonly primaryPair: Pair | null;
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly sources: ReadonlyArray<string>;
  readonly enrichedAt: Date;
}

/**
 * Aggregated real-time market data for a token.
 *
 * Idempotent: same `(chain, address)` → same id (overwrites on re-enrich).
 *
 * Fields are nullable: a token freshly launched may not have holders
 * data; a low-liquidity token may not have a clear FDV.
 */
export class TokenSnapshot extends AggregateRoot<string> {
  private readonly state: TokenSnapshotProps;

  protected constructor(id: string, props: TokenSnapshotProps) {
    super(id);
    this.state = props;
  }

  public static create(input: SnapshotInput): TokenSnapshot {
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, `address cannot be empty`);
    }
    const id = `${input.chain.value}:${input.address.toLowerCase()}`;
    const primaryPair = pickPrimaryPair(input.pairs);

    return new TokenSnapshot(id, {
      chain: input.chain,
      address: input.address.toLowerCase(),
      pairs: Object.freeze([...input.pairs]),
      primaryPair,
      priceUsd: input.priceUsd,
      liquidityUsd: input.liquidityUsd,
      volume24hUsd: input.volume24hUsd,
      marketCapUsd: input.marketCapUsd,
      fdvUsd: input.fdvUsd,
      priceChange24h: input.priceChange24h,
      holders: input.holders,
      top10HolderPercent: input.top10HolderPercent,
      sources: Object.freeze([...input.sources]),
      enrichedAt: new Date(),
    });
  }

  public get chain(): ChainId {
    return this.state.chain;
  }
  public get address(): string {
    return this.state.address;
  }
  public get pairs(): ReadonlyArray<Pair> {
    return this.state.pairs;
  }
  public get primaryPair(): Pair | null {
    return this.state.primaryPair;
  }
  public get priceUsd(): number | null {
    return this.state.priceUsd;
  }
  public get liquidityUsd(): number | null {
    return this.state.liquidityUsd;
  }
  public get volume24hUsd(): number | null {
    return this.state.volume24hUsd;
  }
  public get marketCapUsd(): number | null {
    return this.state.marketCapUsd;
  }
  public get fdvUsd(): number | null {
    return this.state.fdvUsd;
  }
  public get priceChange24h(): number | null {
    return this.state.priceChange24h;
  }
  public get holders(): number | null {
    return this.state.holders;
  }
  public get top10HolderPercent(): number | null {
    return this.state.top10HolderPercent;
  }
  public get sources(): ReadonlyArray<string> {
    return this.state.sources;
  }
  public get enrichedAt(): Date {
    return this.state.enrichedAt;
  }
  public get age(): number {
    return Date.now() - this.state.enrichedAt.getTime();
  }

  public isFresh(maxAgeMs: number): boolean {
    return this.age <= maxAgeMs;
  }

  public hasMarketData(): boolean {
    return (
      this.state.priceUsd !== null ||
      this.state.liquidityUsd !== null ||
      this.state.marketCapUsd !== null ||
      this.state.pairs.length > 0
    );
  }

  public completenessScore(): number {
    const fields = [
      this.state.priceUsd,
      this.state.liquidityUsd,
      this.state.volume24hUsd,
      this.state.marketCapUsd,
      this.state.fdvUsd,
      this.state.priceChange24h,
      this.state.holders,
      this.state.top10HolderPercent,
    ];
    const present = fields.filter((f) => f !== null).length;
    return present / fields.length;
  }

  public emitEnriched(): void {
    this.apply(
      new TokenEnrichedEvent({
        chain: this.state.chain.value,
        address: this.state.address,
        priceUsd: this.state.priceUsd,
        liquidityUsd: this.state.liquidityUsd,
        volume24hUsd: this.state.volume24hUsd,
        marketCapUsd: this.state.marketCapUsd,
        fdvUsd: this.state.fdvUsd,
        priceChange24h: this.state.priceChange24h,
        holders: this.state.holders,
        top10HolderPercent: this.state.top10HolderPercent,
        primaryPair: this.state.primaryPair
          ? {
              address: this.state.primaryPair.address,
              dexId: this.state.primaryPair.dexId,
              quoteToken: this.state.primaryPair.quoteToken,
            }
          : null,
        pairCount: this.state.pairs.length,
        sources: [...this.state.sources],
        completeness: this.completenessScore(),
        enrichedAt: this.state.enrichedAt,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

function pickPrimaryPair(pairs: ReadonlyArray<Pair>): Pair | null {
  if (pairs.length === 0) return null;
  let best = pairs[0];
  for (let i = 1; i < pairs.length; i++) {
    const current = pairs[i];
    if (current.reserveUsd > best.reserveUsd) best = current;
  }
  return best;
}

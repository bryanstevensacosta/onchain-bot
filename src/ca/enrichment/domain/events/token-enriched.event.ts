import { DomainEvent } from 'shared/kernel/domain-event';

export interface PrimaryPairPayload {
  readonly address: string;
  readonly dexId: string;
  readonly quoteToken: string;
}

/**
 * Emitted by the enrichment BC when a TokenSnapshot is successfully
 * created. Consumed by classification, scoring, filters, and downstream BCs.
 */
export class TokenEnrichedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly priceUsd: number | null;
    readonly liquidityUsd: number | null;
    readonly volume24hUsd: number | null;
    readonly marketCapUsd: number | null;
    readonly fdvUsd: number | null;
    readonly priceChange24h: number | null;
    readonly holders: number | null;
    readonly top10HolderPercent: number | null;
    readonly primaryPair: PrimaryPairPayload | null;
    readonly pairCount: number;
    readonly sources: ReadonlyArray<string>;
    readonly completeness: number;
    readonly enrichedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    priceChange24h: number | null;
    holders: number | null;
    top10HolderPercent: number | null;
    primaryPair: PrimaryPairPayload | null;
    pairCount: number;
    sources: ReadonlyArray<string>;
    completeness: number;
    enrichedAt: Date;
  }) {
    super('enrichment.token.enriched', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze({
      ...payload,
      sources: Object.freeze([...payload.sources]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      sources: [...this.payload.sources],
      enrichedAt: this.payload.enrichedAt.toISOString(),
    };
  }
}

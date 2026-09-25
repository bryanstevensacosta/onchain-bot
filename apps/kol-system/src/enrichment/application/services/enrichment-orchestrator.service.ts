import { Inject, Injectable, Logger } from '@nestjs/common';
import { MARKET_DATA_PROVIDERS } from '../../enrichment.tokens';
import {
  MarketData,
  MarketDataPort,
} from '../../domain/ports/market-data.port';
import { SnapshotWriterPort } from '../../domain/ports/snapshot-writer.port';
import { MentionSnapshot } from '../../../snapshot/domain/entities/mention-snapshot.entity';

export interface EnrichMentionInput {
  readonly mentionId: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly contractIndex: number;
  readonly chain: string;
  readonly address: string;
  /** P26 base: Telegram capture time (stamped by extraction). */
  readonly occurred_at_telegram: Date;
  /** P26 base: kol-system ingestion time (stamped by extraction). */
  readonly ingested_at_kol: Date;
}

export interface EnrichMentionResult {
  /** Completed snapshot (persisted via SnapshotWriterPort before return). */
  readonly snapshot: MentionSnapshot;
  readonly errors: ReadonlyArray<{ provider: string; message: string }>;
}

/**
 * Enrichment orchestrator against `MarketDataPort` (Tramo 1, todo 8, P7).
 *
 * Cascade logic mirrors the backend `EnrichTokenUseCase` read-only:
 * providers run in parallel (`Promise.allSettled`), results merge
 * first-non-null per field (provider order wins), and every failure —
 * throw OR null — is recorded in `errors` while the cascade continues
 * (silent-null fallback; adversarial: provider down -> null + next).
 *
 * `mc at` semantics: `marketCapUsd` is the market cap AT `enriched_at`
 * (= `snapshot_at`), i.e. a snapshot at capture, NOT a live quote. The
 * value lags the Telegram capture by the SSE-delivery + enrichment delay,
 * documented <= 30s (P20 reconnect catch-up is the noisy tail; steady-state
 * delivery is seconds).
 *
 * Direct call, fix-1: invoked synchronously, no event bus. The completed
 * snapshot is written through `SnapshotWriterPort` (P27: entity owned by
 * `src/snapshot/`, same kol-system DB) before returning.
 */
@Injectable()
export class EnrichmentOrchestratorService {
  private readonly logger = new Logger(EnrichmentOrchestratorService.name);

  public constructor(
    @Inject(MARKET_DATA_PROVIDERS)
    private readonly providers: ReadonlyArray<MarketDataPort>,
    private readonly snapshots: SnapshotWriterPort,
  ) {
    if (providers.length === 0) {
      throw new Error(
        'EnrichmentOrchestratorService requires at least one MarketDataPort',
      );
    }
  }

  public async enrich(input: EnrichMentionInput): Promise<EnrichMentionResult> {
    const settled = await Promise.allSettled(
      this.providers.map((p) => p.fetch(input.chain, input.address)),
    );

    const errors: Array<{ provider: string; message: string }> = [];
    const successful: MarketData[] = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const provider = this.providers[i];
      if (result.status === 'rejected') {
        errors.push({
          provider: provider.name,
          message: (result.reason as Error).message,
        });
        continue;
      }
      if (result.value === null) {
        errors.push({ provider: provider.name, message: 'no data' });
        continue;
      }
      this.logger.debug(`Enriched ${input.address} via ${provider.name}`);
      successful.push(result.value);
    }

    const merged = mergeMarketData(successful);
    const snapshot = MentionSnapshot.create({
      mentionId: input.mentionId,
      kolId: input.kolId,
      messageId: input.messageId,
      contractIndex: input.contractIndex,
      contractAddress: input.address,
      chain: input.chain,
      occurred_at_telegram: input.occurred_at_telegram,
      ingested_at_kol: input.ingested_at_kol,
      enriched_at: new Date(),
      ...merged,
    });
    await this.snapshots.save(snapshot);
    return { snapshot, errors };
  }
}

/**
 * First-non-null per field wins (provider order) — read-only mirror of the
 * backend `mergeMarketData` in `enrich-token.use-case.ts`.
 */
function mergeMarketData(data: ReadonlyArray<MarketData>): MarketData {
  const first = <T>(getter: (d: MarketData) => T | null): T | null => {
    for (const d of data) {
      const v = getter(d);
      if (v !== null) {
        return v;
      }
    }
    return null;
  };
  return {
    priceUsd: first((d) => d.priceUsd),
    liquidityUsd: first((d) => d.liquidityUsd),
    volume24hUsd: first((d) => d.volume24hUsd),
    marketCapUsd: first((d) => d.marketCapUsd),
    fdvUsd: first((d) => d.fdvUsd),
    priceChange24h: first((d) => d.priceChange24h),
    holders: first((d) => d.holders),
    top10HolderPercent: first((d) => d.top10HolderPercent),
    symbol: first((d) => d.symbol),
    name: first((d) => d.name),
    lockedLiquidityPercent: first((d) => d.lockedLiquidityPercent),
    burnedPercent: first((d) => d.burnedPercent),
  };
}

import { CanonicalTokenCall } from 'ca/normalization/domain/entities/canonical-token-call.entity';
import { TokenIdentity } from 'ca/normalization/domain/value-objects/token-identity.vo';
import { Source } from 'ca/normalization/domain/value-objects/source.vo';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import { Chain } from 'ca/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'ca/normalization/domain/value-objects/normalized-address.vo';
import { CanonicalTokenCallEntity } from 'ca/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';

/**
 * Maps between the rich `CanonicalTokenCall` domain aggregate and its
 * anemic TypeORM persistence shape. Lives in infrastructure because the
 * mapping depends on the storage representation (JSONB sources, numeric
 * columns for `bestMetrics`, etc.).
 *
 * `numeric` columns in Postgres are stored as strings to preserve
 * precision; this mapper parses them back to JS `number` on hydration.
 * Real production code with very large FDVs should switch to `bigint`
 * or store as `numeric` and pass through as `string` end-to-end.
 */
export class CanonicalTokenCallMapper {
  public static toEntity(call: CanonicalTokenCall): CanonicalTokenCallEntity {
    const row = new CanonicalTokenCallEntity();
    row.id = call.id;
    row.chain = call.identity.chain.value;
    row.address = call.identity.address.value;
    row.ticker = call.ticker;
    row.name = call.name;
    row.chart = call.chart;
    row.marketCapUsd = numberOrNull(call.bestMetrics.marketCapUsd);
    row.liquidityUsd = numberOrNull(call.bestMetrics.liquidityUsd);
    row.fdvUsd = numberOrNull(call.bestMetrics.fdvUsd);
    row.holders = call.bestMetrics.holders;
    row.sources = call.sources.map((s) => ({
      channelId: s.channelId,
      username: s.username,
      messageIds: [...s.messageIds],
    }));
    row.mentionCount = call.mentionCount;
    row.firstSeenAt = call.firstSeenAt;
    row.lastSeenAt = call.lastSeenAt;
    row.lastConfidence = call.lastConfidence;
    return row;
  }

  public static toDomain(row: CanonicalTokenCallEntity): CanonicalTokenCall {
    const identity = TokenIdentity.create(
      Chain.fromString(row.chain),
      NormalizedAddress.fromChainHint(row.address, row.chain) ??
        // Fallback: if address no longer parses as canonical (very unlikely
        // after a migration), reconstruct a loose address so we don't drop
        // history. The address VO validates format strictly.
        reconstructLooseAddress(row.chain, row.address),
    );

    const bestMetrics = TokenMetrics.create({
      marketCapUsd: parseNumeric(row.marketCapUsd),
      liquidityUsd: parseNumeric(row.liquidityUsd),
      fdvUsd: parseNumeric(row.fdvUsd),
      holders: row.holders,
    });

    const sources: Source[] = (row.sources ?? [])
      .map((s) =>
        Source.firstMention(s.channelId, s.messageIds[0] ?? 0, s.username),
      )
      .map((seed, idx) => {
        const messageIds = (row.sources[idx].messageIds ?? []).slice(1);
        return messageIds.reduce<Source>(
          (acc, mid) => acc.addMessage(mid),
          seed,
        );
      });

    return CanonicalTokenCall.reconstitute({
      identity,
      ticker: row.ticker,
      name: row.name,
      chart: row.chart,
      bestMetrics,
      sources: Object.freeze(sources),
      mentionCount: row.mentionCount,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      lastConfidence: row.lastConfidence,
    });
  }
}

function numberOrNull(n: number | null): string | null {
  return n === null || n === undefined ? null : String(n);
}

function parseNumeric(raw: string | null): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function reconstructLooseAddress(
  chain: string,
  raw: string,
): NormalizedAddress {
  // Should never happen in practice. The repository's idempotent
  // save + the strict address VO at the application layer guarantee
  // every stored address round-trips. This guard exists so a future
  // bad migration doesn't crash the whole ingestion pipeline.
  if (chain === 'evm') {
    return NormalizedAddress.fromEvm(raw);
  }
  return NormalizedAddress.fromSolana(raw);
}

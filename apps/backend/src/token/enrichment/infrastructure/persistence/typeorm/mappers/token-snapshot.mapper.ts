import { TokenSnapshot } from '../../../../domain/entities/token-snapshot.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { Pair } from '../../../../domain/value-objects/pair.vo';
import { TokenSnapshotEntity } from '../entities/token-snapshot.entity';

export class TokenSnapshotMapper {
  public static toRow(s: TokenSnapshot): TokenSnapshotEntity {
    const row = new TokenSnapshotEntity();
    row.id = s.id;
    row.chain = s.chain.value;
    row.address = s.address;
    row.pairs = s.pairs.map((p) => ({
      address: p.address,
      dexId: p.dexId,
      quoteToken: p.quoteToken,
      reserveUsd: p.reserveUsd,
    }));
    row.primaryPair = s.primaryPair
      ? {
          address: s.primaryPair.address,
          dexId: s.primaryPair.dexId,
          quoteToken: s.primaryPair.quoteToken,
          reserveUsd: s.primaryPair.reserveUsd,
        }
      : null;
    row.priceUsd = s.priceUsd !== null ? String(s.priceUsd) : null;
    row.liquidityUsd = s.liquidityUsd !== null ? String(s.liquidityUsd) : null;
    row.volume24hUsd = s.volume24hUsd !== null ? String(s.volume24hUsd) : null;
    row.marketCapUsd = s.marketCapUsd !== null ? String(s.marketCapUsd) : null;
    row.fdvUsd = s.fdvUsd !== null ? String(s.fdvUsd) : null;
    row.priceChange24h = s.priceChange24h;
    row.holders = s.holders;
    row.top10HolderPercent = s.top10HolderPercent;
    row.name = s.name;
    row.imageUrls = [...s.imageUrls];
    row.lockedLiquidityPercent = s.lockedLiquidityPercent;
    row.burnedPercent = s.burnedPercent;
    row.sources = [...s.sources];
    row.snapshotCompleteness =
      s.snapshotCompleteness !== null ? s.snapshotCompleteness : null;
    row.providerErrors = s.providerErrors.map((e) => ({
      provider: e.provider,
      message: e.message,
    }));
    row.enrichedAt = s.enrichedAt;
    return row;
  }

  public static toDomain(row: TokenSnapshotEntity): TokenSnapshot {
    const pairs = row.pairs.map((p) =>
      Pair.create({
        address: p.address,
        dexId: p.dexId,
        quoteToken: p.quoteToken,
        reserveUsd: p.reserveUsd,
      }),
    );
    const primaryPair = row.primaryPair
      ? Pair.create({
          address: row.primaryPair.address,
          dexId: row.primaryPair.dexId,
          quoteToken: row.primaryPair.quoteToken,
          reserveUsd: row.primaryPair.reserveUsd,
        })
      : null;
    return TokenSnapshot.rehydrate({
      id: row.id,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      pairs,
      primaryPair,
      priceUsd: row.priceUsd !== null ? Number(row.priceUsd) : null,
      liquidityUsd: row.liquidityUsd !== null ? Number(row.liquidityUsd) : null,
      volume24hUsd: row.volume24hUsd !== null ? Number(row.volume24hUsd) : null,
      marketCapUsd: row.marketCapUsd !== null ? Number(row.marketCapUsd) : null,
      fdvUsd: row.fdvUsd !== null ? Number(row.fdvUsd) : null,
      priceChange24h: row.priceChange24h,
      holders: row.holders,
      top10HolderPercent: row.top10HolderPercent,
      symbol: row.symbol ?? null,
      name: row.name ?? null,
      imageUrls: row.imageUrls ?? [],
      lockedLiquidityPercent: row.lockedLiquidityPercent ?? null,
      burnedPercent: row.burnedPercent ?? null,
      sources: row.sources,
      snapshotCompleteness:
        row.snapshotCompleteness !== null
          ? Number(row.snapshotCompleteness)
          : null,
      providerErrors: row.providerErrors
        ? row.providerErrors.map(
            (e: { provider: string; message: string }) => ({
              provider: e.provider,
              message: e.message,
            }),
          )
        : [],
      enrichedAt: row.enrichedAt,
    });
  }
}

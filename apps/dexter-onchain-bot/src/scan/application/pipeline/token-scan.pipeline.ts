import { Injectable } from '@nestjs/common';
import {
  MarketDataClient,
  toLaunchpadOrNull,
  toVenueOrNull,
  type MarketDataSnapshot,
} from '@/scan/infrastructure/market-data/market-data.client';
import {
  isEvmAddress,
  isSolanaAddress,
} from '@/scan/domain/detector/address-detector';
import type {
  ChainIdentifier,
  ResolvedToken,
  ScanPipeline,
} from '@/scan/domain/ports/scan-pipeline.port';

/**
 * Token scan pipeline (Tramo 3, todo 9, P13).
 *
 * Moved from backend chain-dexter-bot
 * `application/handlers/token-scan.pipeline.ts` + `token-scan.service.ts`
 * `getTokenInfo`, re-wired onto market-data HTTP (todo 5 bridge,
 * default-true): `resolve` renders the token card from the market-data
 * snapshot instead of composing DetectChain + Enrich use cases directly
 * (those cross-BC imports stay in the backend — this app is lookup-only).
 */

export type { ChainIdentifier, ResolvedToken, ScanPipeline };

export type ResolveOutcome =
  | { readonly status: 'resolved'; readonly token: ResolvedToken }
  | {
      readonly status: 'ambiguous';
      readonly address: string;
      readonly candidates: ReadonlyArray<string>;
    }
  | {
      readonly status: 'invalid';
      readonly address: string;
      readonly reason: string;
    }
  | { readonly status: 'not-found'; readonly address: string };

const SOLANA_CANDIDATES: ReadonlyArray<string> = ['solana'];

const EVM_CANDIDATES: ReadonlyArray<string> = [
  'ethereum',
  'base',
  'bsc',
  'arbitrum',
  'polygon',
];

function hasIdentity(snapshot: {
  readonly symbol: string | null;
  readonly name: string | null;
}): boolean {
  return snapshot.symbol !== null || snapshot.name !== null;
}

function parseChainPrefix(input: string): {
  chain: string | null;
  address: string;
} {
  const idx = input.indexOf(':');
  if (idx > 0) {
    const chain = input.slice(0, idx).trim().toLowerCase();
    const address = input.slice(idx + 1).trim();
    if (chain !== '' && address !== '') return { chain, address };
  }
  return { chain: null, address: input.trim() };
}

@Injectable()
export class TokenScanPipeline implements ScanPipeline {
  public constructor(private readonly marketData: MarketDataClient) {}

  public async resolve(address: string): Promise<ResolvedToken | null> {
    const outcome = await this.resolveDetailed(address);
    return outcome.status === 'resolved' ? outcome.token : null;
  }

  public async resolveDetailed(address: string): Promise<ResolveOutcome> {
    const { chain, address: bare } = parseChainPrefix(address);
    if (bare === '') {
      return { status: 'invalid', address, reason: 'empty address' };
    }

    if (chain !== null) {
      const snapshot = await this.marketData.getSnapshot(chain, bare);
      if (!snapshot || !hasIdentity(snapshot)) {
        return { status: 'not-found', address: bare };
      }
      return {
        status: 'resolved',
        token: this.toResolvedToken(chain, bare, snapshot),
      };
    }

    if (!isEvmAddress(bare) && !isSolanaAddress(bare)) {
      return {
        status: 'invalid',
        address: bare,
        reason:
          'unrecognized address format (expected 0x + 40 hex for EVM or base58 32-44 chars for Solana)',
      };
    }

    const sweep = isSolanaAddress(bare) ? SOLANA_CANDIDATES : EVM_CANDIDATES;
    const ordered = await this.detectFirst(bare, sweep);
    const hits: Array<{ chain: string; snapshot: MarketDataSnapshot }> = [];
    for (const candidate of ordered) {
      const snapshot = await this.marketData.getSnapshot(candidate, bare);
      if (snapshot && hasIdentity(snapshot)) {
        hits.push({ chain: candidate, snapshot });
      }
    }
    if (hits.length === 1) {
      const hit = hits[0];
      return {
        status: 'resolved',
        token: this.toResolvedToken(hit.chain, bare, hit.snapshot),
      };
    }
    if (hits.length > 1) {
      return {
        status: 'ambiguous',
        address: bare,
        candidates: hits.map((hit) => hit.chain),
      };
    }
    return { status: 'not-found', address: bare };
  }

  private async detectFirst(
    bare: string,
    sweep: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<string>> {
    let detected: string | null = null;
    try {
      detected = (await this.marketData.detectChain(bare))?.chainId ?? null;
    } catch {
      detected = null;
    }
    if (detected === null) return sweep;
    if (sweep.includes(detected)) {
      return [detected, ...sweep.filter((chain) => chain !== detected)];
    }
    return [detected, ...sweep];
  }

  private toResolvedToken(
    chain: string,
    address: string,
    snapshot: {
      readonly symbol: string | null;
      readonly name: string | null;
      readonly marketCapUsd: number | null;
      readonly fdvUsd: number | null;
      readonly priceUsd: number | null;
      readonly priceChange24h: number | null;
      readonly liquidityUsd: number | null;
      readonly lockedLiquidityPercent: number | null;
      readonly burnedPercent: number | null;
      readonly volume24hUsd: number | null;
      readonly holders: number | null;
      readonly top10HolderPercent: number | null;
      readonly totalSupply: number | null;
      readonly circulatingSupply: number | null;
      readonly maxSupply: number | null;
      readonly devWallets?: ReadonlyArray<{
        readonly wallet: string;
        readonly holdAmount: number | null;
        readonly percentOfSupply: number | null;
        readonly pnlUsd: number | null;
        readonly tag: string | null;
        readonly probable?: boolean;
      }> | null;
      readonly devPctSupply?: number | null;
      readonly launchpad?: unknown;
      readonly venue?: unknown;
    },
  ): ResolvedToken {
    return {
      address,
      chain: chain as ChainIdentifier,
      symbol: snapshot.symbol ?? '???',
      name: snapshot.name ?? 'Unknown',
      marketCapUsd: snapshot.marketCapUsd,
      fdvUsd: snapshot.fdvUsd,
      priceUsd: snapshot.priceUsd,
      priceChange24h: snapshot.priceChange24h,
      liquidityUsd: snapshot.liquidityUsd,
      lockedLiquidityPercent: snapshot.lockedLiquidityPercent,
      burnedPercent: snapshot.burnedPercent,
      volume24hUsd: snapshot.volume24hUsd,
      holders: snapshot.holders,
      top10HolderPercent: snapshot.top10HolderPercent,
      top20HolderPercent: null,
      totalSupply: snapshot.totalSupply,
      circulatingSupply: snapshot.circulatingSupply,
      maxSupply: snapshot.maxSupply,
      devWallets: snapshot.devWallets ?? null,
      devPctSupply: snapshot.devPctSupply ?? null,
      poolAddress: null,
      source: 'market-data-http',
      launchpad: toLaunchpadOrNull(snapshot.launchpad),
      venue: toVenueOrNull(snapshot.venue),
    };
  }
}

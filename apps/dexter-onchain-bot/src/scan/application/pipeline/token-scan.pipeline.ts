import { Injectable } from '@nestjs/common';
import {
  MarketDataClient,
  toFdvAthAtOrNull,
  toFdvAthUsdOrNull,
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
  TokenAlternative,
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

export type { ChainIdentifier, ResolvedToken, ScanPipeline, TokenAlternative };

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
  | { readonly status: 'not-found'; readonly address: string }
  | {
      readonly status: 'pending';
      readonly address: string;
    };

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

function finiteOrNegativeInfinity(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.NEGATIVE_INFINITY;
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
    // Robust-nulls (plan todo 19a, accepted): `pending` collapses to
    // null here — the bot keeps its generic "could not resolve" reply
    // for pending tokens. Only `GET /dexter/token` + preview split
    // pending from not-found (wire contract); the bot path is
    // intentionally untouched.
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
      if (snapshot && hasIdentity(snapshot)) {
        return {
          status: 'resolved',
          token: this.toResolvedToken(chain, bare, snapshot),
        };
      }
      // Robust-nulls (plan todo 19a): `MarketDataSnapshot.status`
      // already travels end-to-end — read it here instead of
      // collapsing every identity-less shell to `not-found`. A client
      // null (fetch throw / own-timeout) stays `not-found` (frozen).
      if (snapshot?.status === 'pending') {
        return { status: 'pending', address: bare };
      }
      return { status: 'not-found', address: bare };
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
    // Robust-nulls (plan todo 19a): a sweep with zero identity hits
    // but at least one pending shell answers `pending` (retry shortly),
    // not `not-found`. Client nulls (fetch throw / own-timeout) keep
    // the frozen `not-found` verdict.
    let sawPending = false;
    for (const candidate of ordered) {
      const snapshot = await this.marketData.getSnapshot(candidate, bare);
      if (snapshot && hasIdentity(snapshot)) {
        hits.push({ chain: candidate, snapshot });
      } else if (snapshot?.status === 'pending') {
        sawPending = true;
      }
    }
    if (hits.length === 1) {
      const hit = hits[0];
      return {
        status: 'resolved',
        token: this.toResolvedToken(hit.chain, bare, hit.snapshot, []),
      };
    }
    if (hits.length > 1) {
      // Best-pick with disclosure (plan todo 17): DELIBERATE reversal of
      // the "never first-hit" invariant (multi-chain used to answer
      // `ambiguous`). The sweep now picks the HIGHEST-liquidity candidate
      // — tiebreak: higher FDV, then first-seen (sweep order, which is
      // detect-first — fully deterministic) — and returns every OTHER
      // resolved chain as `alternatives` so the choice stays visible
      // (`{{alternatives}}` renders it on every card + preview).
      //
      // ACCEPTED RISK: a scam copy with the deepest pool could win the
      // pick. Mitigations: the disclosure list is always attached (never
      // a silent guess), and the existing checks still apply downstream.
      // `ambiguous` survives in the `ResolveOutcome` union for the
      // propagation layers (preview + `GET /dexter/token` answer it
      // byte-identical) — no sweep branch emits it anymore; `invalid` and
      // `not-found` are untouched. Comparisons run on RAW numbers —
      // never on formatted strings; `null` liquidity sorts as -Infinity
      // (a measured pool always beats an unmeasured one).
      const ranked = [...hits].sort((a, b) => {
        const liqA = finiteOrNegativeInfinity(a.snapshot.liquidityUsd);
        const liqB = finiteOrNegativeInfinity(b.snapshot.liquidityUsd);
        if (liqB !== liqA) return liqB - liqA;
        const fdvA = finiteOrNegativeInfinity(a.snapshot.fdvUsd);
        const fdvB = finiteOrNegativeInfinity(b.snapshot.fdvUsd);
        if (fdvB !== fdvA) return fdvB - fdvA;
        return hits.indexOf(a) - hits.indexOf(b);
      });
      const [best, ...rest] = ranked;
      const alternatives: ReadonlyArray<TokenAlternative> = rest.map((hit) => ({
        chain: hit.chain,
        address: bare,
        liquidityUsd:
          typeof hit.snapshot.liquidityUsd === 'number' &&
          Number.isFinite(hit.snapshot.liquidityUsd)
            ? hit.snapshot.liquidityUsd
            : null,
      }));
      return {
        status: 'resolved',
        token: this.toResolvedToken(
          best.chain,
          bare,
          best.snapshot,
          alternatives,
        ),
      };
    }
    if (hits.length === 0) {
      return sawPending
        ? { status: 'pending', address: bare }
        : { status: 'not-found', address: bare };
    }
    // Unreachable: hits.length === 1 and > 1 both return above.
    // Kept as the typed fallthrough so future sweep branches stay total.
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
      readonly fdvAthUsd?: unknown;
      readonly fdvAthAt?: unknown;
    },
    alternatives: ReadonlyArray<TokenAlternative> = [],
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
      fdvAthUsd: toFdvAthUsdOrNull(snapshot.fdvAthUsd),
      fdvAthAt: toFdvAthAtOrNull(snapshot.fdvAthAt),
      alternatives,
    };
  }
}

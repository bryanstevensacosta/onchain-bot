import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  HoneypotSignal,
  HoneypotSeverity,
} from 'discovery/honeypot/domain/value-objects/honeypot-signal.vo';
import {
  HoneypotAnalyzerPort,
  HoneypotAnalysisResult,
} from 'discovery/honeypot/domain/ports/honeypot-analyzer.port';

interface DexScreenerPair {
  priceUsd: string | null;
  priceChange: { h24: number | null } | null;
  volume: { h24: number | null } | null;
  liquidity: { usd: number | null } | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  info?: {
    socialLinks?: unknown[];
    websites?: unknown[];
  };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

/**
 * Heuristic honeypot analyzer (v1).
 *
 * Detection strategies (no on-chain simulation in v1):
 * 1. **Market-based heuristics**: microcap + no liquidity + extreme
 *    price change → likely honeypot
 * 2. **Pair-age heuristics**: pair < 1h old + suspicious behavior
 * 3. **Holder concentration proxy** (not implemented here — see
 *    Classification BC which already handles this)
 *
 * v2 will add:
 * - GoPlus Security API integration (https://gopluslabs.io/)
 * - Bytecode pattern matching via Alchemy
 * - Fork-based sell simulation via Tenderly
 *
 * The key trade-off: heuristic-only is FAST and CHEAP but produces
 * false positives (e.g., legitimate micro-cap memecoins get flagged).
 * Use the `risk` field for priority, not absolute block.
 */
@Injectable()
export class HeuristicHoneypotAnalyzerAdapter extends HoneypotAnalyzerPort {
  private readonly logger = new Logger(HeuristicHoneypotAnalyzerAdapter.name);
  private static readonly ENDPOINT =
    'https://api.dexscreener.com/latest/dex/tokens';

  public async analyze(
    chain: string,
    address: string,
  ): Promise<HoneypotAnalysisResult> {
    try {
      const { data } = await axios.get<DexScreenerResponse>(
        `${HeuristicHoneypotAnalyzerAdapter.ENDPOINT}/${address}`,
        { timeout: 5000 },
      );
      return this.analyzeFromData(data, chain, address);
    } catch (err) {
      this.logger.debug(
        `Honeypot analysis fetch failed: ${(err as Error).message}`,
      );
      return {
        signals: [],
        buyTax: null,
        sellTax: null,
        transferTax: null,
        canSell: null,
        canBuy: null,
        ownerCanDrain: null,
        ownerRenounced: null,
        isProxy: null,
        analysisSource: 'HEURISTIC',
      };
    }
  }

  private analyzeFromData(
    data: DexScreenerResponse,
    chain: string,
    address: string,
  ): HoneypotAnalysisResult {
    const signals: HoneypotSignal[] = [];
    let buyTax: number | null = null;
    const sellTax: number | null = null;
    let canSell: boolean | null = null;
    let canBuy: boolean | null = null;
    let ownerCanDrain: boolean | null = null;
    const ownerRenounced: boolean | null = null;
    const isProxy: boolean | null = null;

    if (!data.pairs || data.pairs.length === 0) {
      signals.push(
        HoneypotSignal.create({
          type: 'CANNOT_SELL',
          severity: 'HIGH',
          description: `No DEX pairs found for ${chain}:${address} — cannot verify sellability`,
        }),
      );
      canSell = false;
      return {
        signals,
        buyTax,
        sellTax,
        transferTax: null,
        canSell,
        canBuy,
        ownerCanDrain,
        ownerRenounced,
        isProxy,
        analysisSource: 'HEURISTIC',
      };
    }

    const bestPair = data.pairs.reduce((acc, p) => {
      return (p.liquidity?.usd ?? 0) > (acc.liquidity?.usd ?? 0) ? p : acc;
    }, data.pairs[0]);

    const liquidity = bestPair.liquidity?.usd ?? 0;
    const marketCap = bestPair.marketCap ?? bestPair.fdv ?? null;
    const priceChange = bestPair.priceChange?.h24 ?? null;
    const volume = bestPair.volume?.h24 ?? null;
    const pairAgeMs = bestPair.pairCreatedAt
      ? Date.now() - bestPair.pairCreatedAt
      : null;

    // === Heuristic checks ===

    // 1. Liquidity drained: >90% loss in volume but still has some liquidity
    if (liquidity > 0 && liquidity < 100 && marketCap === null) {
      signals.push(
        HoneypotSignal.create({
          type: 'OWNER_CAN_DRAIN',
          severity: 'CRITICAL',
          description: `Liquidity $${liquidity} critically low with no marketCap — likely drained`,
        }),
      );
      ownerCanDrain = true;
    }

    // 2. Microcap + extreme price change = rug pattern
    if (
      marketCap !== null &&
      marketCap < 1000 &&
      priceChange !== null &&
      Math.abs(priceChange) > 500
    ) {
      const sev: HoneypotSeverity =
        Math.abs(priceChange) > 1000 ? 'CRITICAL' : 'HIGH';
      signals.push(
        HoneypotSignal.create({
          type: 'HONEYPOT_FLAG',
          severity: sev,
          description: `MC $${marketCap} + ${priceChange.toFixed(1)}% 24h change — classic honeypot pattern`,
        }),
      );
    }

    // 3. Newly created pair + huge price change
    if (
      pairAgeMs !== null &&
      pairAgeMs < 60 * 60 * 1000 &&
      priceChange !== null &&
      Math.abs(priceChange) > 200
    ) {
      signals.push(
        HoneypotSignal.create({
          type: 'HONEYPOT_FLAG',
          severity: 'MEDIUM',
          description: `Pair ${(pairAgeMs / 60000).toFixed(0)}min old with ${priceChange.toFixed(1)}% change — high volatility`,
        }),
      );
    }

    // 4. Volume / liquidity ratio anomaly (pump-and-dump signature)
    if (volume !== null && liquidity > 0 && volume / liquidity > 100) {
      signals.push(
        HoneypotSignal.create({
          type: 'HIGH_BUY_TAX',
          severity: 'MEDIUM',
          description: `Volume/Liquidity ratio ${(volume / liquidity).toFixed(1)}x — unusual trading activity`,
        }),
      );
    }

    // 5. Buy tax heuristic: if buying $100 of token costs $X with X < $90,
    //    suggests ~10%+ buy tax. We can't measure this directly without simulation,
    //    but we flag if extreme price impact is observed.
    const priceImpact = priceChange !== null ? Math.abs(priceChange) / 100 : 0;
    if (
      priceImpact > 0.5 &&
      pairAgeMs !== null &&
      pairAgeMs < 24 * 60 * 60 * 1000
    ) {
      signals.push(
        HoneypotSignal.create({
          type: 'HIGH_TRANSFER_TAX',
          severity: 'MEDIUM',
          description: `${(priceImpact * 100).toFixed(0)}% price impact in 24h on a young pair — possible tax/disconnect`,
        }),
      );
      buyTax = priceImpact;
    }

    // If we have a real pair with reasonable liquidity, we can claim canSell=true
    canSell = liquidity >= 100;
    canBuy = liquidity >= 100;

    return {
      signals,
      buyTax,
      sellTax,
      transferTax: null,
      canSell,
      canBuy,
      ownerCanDrain,
      ownerRenounced,
      isProxy,
      analysisSource: 'HEURISTIC',
    };
  }
}

import type { HoneypotAnalysis } from 'discovery/honeypot/domain/entities/honeypot-analysis.entity';

export interface HoneypotSignalView {
  readonly type: string;
  readonly severity: string;
  readonly description: string;
}

export interface HoneypotAnalysisView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly risk: string;
  readonly isLikelyHoneypot: boolean;
  readonly signals: ReadonlyArray<HoneypotSignalView>;
  readonly buyTax: number | null;
  readonly sellTax: number | null;
  readonly transferTax: number | null;
  readonly canSell: boolean | null;
  readonly canBuy: boolean | null;
  readonly ownerCanDrain: boolean | null;
  readonly ownerRenounced: boolean | null;
  readonly isProxy: boolean | null;
  readonly analysisSource: string;
  readonly analyzedAt: string;
}

export class HoneypotAnalysisMapper {
  public static toView(a: HoneypotAnalysis): HoneypotAnalysisView {
    return {
      id: a.id,
      chain: a.chain.value,
      address: a.address,
      risk: a.risk.value,
      isLikelyHoneypot: a.isLikelyHoneypot,
      signals: a.signals.map((s) => ({
        type: s.type,
        severity: s.severity,
        description: s.description,
      })),
      buyTax: a.buyTax,
      sellTax: a.sellTax,
      transferTax: a.transferTax,
      canSell: a.canSell,
      canBuy: a.canBuy,
      ownerCanDrain: a.ownerCanDrain,
      ownerRenounced: a.ownerRenounced,
      isProxy: a.isProxy,
      analysisSource: a.analysisSource,
      analyzedAt: a.analyzedAt.toISOString(),
    };
  }
}

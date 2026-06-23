import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'chain/identity/chain-id.vo';
import { HoneypotRisk } from 'token/honeypot/domain/value-objects/honeypot-risk.vo';
import { HoneypotSignal } from 'token/honeypot/domain/value-objects/honeypot-signal.vo';
import { HoneypotDetectedEvent } from 'token/honeypot/domain/events/honeypot-detected.event';

export interface HoneypotAnalysisInput {
  readonly chain: ChainId;
  readonly address: string;
  readonly signals: ReadonlyArray<HoneypotSignal>;
  readonly buyTax: number | null;
  readonly sellTax: number | null;
  readonly transferTax: number | null;
  readonly canSell: boolean | null;
  readonly canBuy: boolean | null;
  readonly ownerCanDrain: boolean | null;
  readonly ownerRenounced: boolean | null;
  readonly isProxy: boolean | null;
  readonly analysisSource: 'SIMULATION' | 'STATIC' | 'HEURISTIC';
}

interface HoneypotAnalysisProps {
  readonly chain: ChainId;
  readonly address: string;
  readonly risk: HoneypotRisk;
  readonly signals: ReadonlyArray<HoneypotSignal>;
  readonly buyTax: number | null;
  readonly sellTax: number | null;
  readonly transferTax: number | null;
  readonly canSell: boolean | null;
  readonly canBuy: boolean | null;
  readonly ownerCanDrain: boolean | null;
  readonly ownerRenounced: boolean | null;
  readonly isProxy: boolean | null;
  readonly analysisSource: 'SIMULATION' | 'STATIC' | 'HEURISTIC';
  readonly analyzedAt: Date;
}

/**
 * Honeypot analysis result for a token contract.
 *
 * Idempotent: same `(chain, address)` → same id (overwrites).
 */
export class HoneypotAnalysis extends AggregateRoot<string> {
  private readonly state: HoneypotAnalysisProps;

  protected constructor(id: string, props: HoneypotAnalysisProps) {
    super(id);
    this.state = props;
  }

  public static create(input: HoneypotAnalysisInput): HoneypotAnalysis {
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, `address cannot be empty`);
    }
    const id = `${input.chain.value}:${input.address.toLowerCase()}`;
    const risk = computeRisk(input.signals);
    return new HoneypotAnalysis(id, {
      chain: input.chain,
      address: input.address.toLowerCase(),
      risk,
      signals: Object.freeze([...input.signals]),
      buyTax: input.buyTax,
      sellTax: input.sellTax,
      transferTax: input.transferTax,
      canSell: input.canSell,
      canBuy: input.canBuy,
      ownerCanDrain: input.ownerCanDrain,
      ownerRenounced: input.ownerRenounced,
      isProxy: input.isProxy,
      analysisSource: input.analysisSource,
      analyzedAt: new Date(),
    });
  }

  /**
   * Reconstruct an aggregate from persistence. Bypasses risk computation
   * and signal analysis.
   */
  public static rehydrate(input: {
    id: string;
    chain: ChainId;
    address: string;
    risk: HoneypotRisk;
    signals: ReadonlyArray<HoneypotSignal>;
    buyTax: number | null;
    sellTax: number | null;
    transferTax: number | null;
    canSell: boolean | null;
    canBuy: boolean | null;
    ownerCanDrain: boolean | null;
    ownerRenounced: boolean | null;
    isProxy: boolean | null;
    analysisSource: 'SIMULATION' | 'STATIC' | 'HEURISTIC';
    analyzedAt: Date;
  }): HoneypotAnalysis {
    return new HoneypotAnalysis(input.id, {
      chain: input.chain,
      address: input.address,
      risk: input.risk,
      signals: input.signals,
      buyTax: input.buyTax,
      sellTax: input.sellTax,
      transferTax: input.transferTax,
      canSell: input.canSell,
      canBuy: input.canBuy,
      ownerCanDrain: input.ownerCanDrain,
      ownerRenounced: input.ownerRenounced,
      isProxy: input.isProxy,
      analysisSource: input.analysisSource,
      analyzedAt: input.analyzedAt,
    });
  }

  public get chain(): ChainId {
    return this.state.chain;
  }
  public get address(): string {
    return this.state.address;
  }
  public get risk(): HoneypotRisk {
    return this.state.risk;
  }
  public get signals(): ReadonlyArray<HoneypotSignal> {
    return this.state.signals;
  }
  public get buyTax(): number | null {
    return this.state.buyTax;
  }
  public get sellTax(): number | null {
    return this.state.sellTax;
  }
  public get transferTax(): number | null {
    return this.state.transferTax;
  }
  public get canSell(): boolean | null {
    return this.state.canSell;
  }
  public get canBuy(): boolean | null {
    return this.state.canBuy;
  }
  public get ownerCanDrain(): boolean | null {
    return this.state.ownerCanDrain;
  }
  public get ownerRenounced(): boolean | null {
    return this.state.ownerRenounced;
  }
  public get isProxy(): boolean | null {
    return this.state.isProxy;
  }
  public get analysisSource(): 'SIMULATION' | 'STATIC' | 'HEURISTIC' {
    return this.state.analysisSource;
  }
  public get analyzedAt(): Date {
    return this.state.analyzedAt;
  }
  public get isLikelyHoneypot(): boolean {
    return this.state.risk.isDangerous();
  }

  public emit(): void {
    this.apply(
      new HoneypotDetectedEvent({
        chain: this.state.chain.value,
        address: this.state.address,
        risk: this.state.risk.value,
        signals: this.state.signals.map((s) => ({
          type: s.type,
          severity: s.severity,
          description: s.description,
        })),
        buyTax: this.state.buyTax,
        sellTax: this.state.sellTax,
        transferTax: this.state.transferTax,
        canSell: this.state.canSell,
        canBuy: this.state.canBuy,
        ownerCanDrain: this.state.ownerCanDrain,
        ownerRenounced: this.state.ownerRenounced,
        isProxy: this.state.isProxy,
        analysisSource: this.state.analysisSource,
        analyzedAt: this.state.analyzedAt,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

/**
 * Compute overall risk level from signals.
 *
 * Decision tree:
 * - 1+ CRITICAL → CRITICAL
 * - 1+ HIGH OR (2+ MEDIUM + 1+ LOW) → HIGH
 * - 1+ MEDIUM OR (3+ LOW) → MEDIUM
 * - 1+ LOW → LOW
 * - else → SAFE
 */
export function computeRisk(
  signals: ReadonlyArray<HoneypotSignal>,
): HoneypotRisk {
  let critical = 0,
    high = 0,
    medium = 0,
    low = 0;
  for (const s of signals) {
    switch (s.severity) {
      case 'CRITICAL':
        critical++;
        break;
      case 'HIGH':
        high++;
        break;
      case 'MEDIUM':
        medium++;
        break;
      case 'LOW':
        low++;
        break;
      case 'INFO':
        break;
    }
  }
  if (critical > 0) return HoneypotRisk.CRITICAL;
  if (high > 0 || (medium >= 2 && low >= 1)) return HoneypotRisk.HIGH;
  if (medium > 0 || low >= 3) return HoneypotRisk.MEDIUM;
  if (low > 0) return HoneypotRisk.LOW;
  return HoneypotRisk.SAFE;
}

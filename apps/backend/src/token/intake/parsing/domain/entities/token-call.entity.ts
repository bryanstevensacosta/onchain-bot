import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ContractAddress } from 'token/intake/extraction/domain/value-objects/contract-address.vo';
import { ParsedContract } from 'token/intake/parsing/domain/value-objects/parsed-contract.vo';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import { CallParsedEvent } from 'token/intake/parsing/domain/events/call-parsed.event';

interface TokenCallProps {
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly contract: ParsedContract;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly metrics: TokenMetrics;
  readonly chart: string | null;
  readonly confidence: number;
  readonly username: string | null;
}

/**
 * Structured token call parsed from a Telegram message.
 *
 * One TokenCall per message (per ExtractionResult). The "primary" contract
 * is the first CA mentioned. Multiple CAs in the same message collapse to
 * one call — downstream chain-detection BC resolves any additional CAs.
 *
 * `confidence` is a 0-1 heuristic score. v1 (heuristic-only) computes it
 * from metrics completeness. v2 (LLM fallback) can use model self-score.
 */
export class TokenCall extends AggregateRoot<string> {
  private readonly state: TokenCallProps;

  protected constructor(id: string, props: TokenCallProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    kolId: string;
    messageId: number;
    occurredAt: Date;
    contractAddresses: ReadonlyArray<ContractAddress>;
    ticker: string | null;
    name: string | null;
    metrics: TokenMetrics;
    chart: string | null;
    username?: string | null;
  }): TokenCall {
    if (!input.kolId) {
      throw new DomainError(ErrorCode.VALIDATION, `kolId cannot be empty`);
    }
    if (!Number.isInteger(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid messageId: ${input.messageId}`,
      );
    }
    if (input.contractAddresses.length === 0) {
      throw new DomainError(
        ErrorCode.NO_CONTRACT_ADDRESS,
        `Cannot build TokenCall without a contract address`,
        { kolId: input.kolId, messageId: input.messageId },
      );
    }
    const contract = ParsedContract.fromAddresses(input.contractAddresses);
    const confidence = computeConfidence({
      ticker: input.ticker,
      name: input.name,
      metrics: input.metrics,
      contractAddressesCount: input.contractAddresses.length,
    });

    return new TokenCall(`${input.kolId}:${input.messageId}`, {
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      contract,
      ticker: input.ticker,
      name: input.name,
      metrics: input.metrics,
      chart: input.chart,
      confidence,
      username: input.username ?? null,
    });
  }

  /**
   * Reconstruct an aggregate from persistence. Bypasses factory validation
   * and confidence recomputation.
   */
  public static rehydrate(input: {
    id: string;
    kolId: string;
    messageId: number;
    occurredAt: Date;
    contract: ParsedContract;
    ticker: string | null;
    name: string | null;
    metrics: TokenMetrics;
    chart: string | null;
    confidence: number;
    username?: string | null;
  }): TokenCall {
    return new TokenCall(input.id, {
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      contract: input.contract,
      ticker: input.ticker,
      name: input.name,
      metrics: input.metrics,
      chart: input.chart,
      confidence: input.confidence,
      username: input.username ?? null,
    });
  }

  public get kolId(): string {
    return this.state.kolId;
  }
  public get messageId(): number {
    return this.state.messageId;
  }
  public get occurredAt(): Date {
    return this.state.occurredAt;
  }
  public get contract(): ParsedContract {
    return this.state.contract;
  }
  public get ticker(): string | null {
    return this.state.ticker;
  }
  public get name(): string | null {
    return this.state.name;
  }
  public get metrics(): TokenMetrics {
    return this.state.metrics;
  }
  public get chart(): string | null {
    return this.state.chart;
  }
  public get confidence(): number {
    return this.state.confidence;
  }

  public get username(): string | null {
    return this.state.username;
  }

  public emitCallParsed(): void {
    this.apply(
      new CallParsedEvent({
        kolId: this.state.kolId,
        messageId: this.state.messageId,
        occurredAt: this.state.occurredAt,
        contractAddress: this.state.contract.address.value,
        contractChainHint: this.state.contract.address.chainHint.value,
        ticker: this.state.ticker,
        name: this.state.name,
        marketCapUsd: this.state.metrics.marketCapUsd,
        liquidityUsd: this.state.metrics.liquidityUsd,
        fdvUsd: this.state.metrics.fdvUsd,
        holders: this.state.metrics.holders,
        chart: this.state.chart,
        confidence: this.state.confidence,
        username: this.state.username,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

function computeConfidence(input: {
  ticker: string | null;
  name: string | null;
  metrics: TokenMetrics;
  contractAddressesCount: number;
}): number {
  let score = 0;
  // Contract address: mandatory (already validated), but multiple CAs is ambiguous
  score += input.contractAddressesCount === 1 ? 0.4 : 0.2;
  // Ticker
  if (input.ticker) score += 0.15;
  // Metrics completeness
  score += input.metrics.completeness * 0.35;
  // Name (rarely explicit in TG alpha calls)
  if (input.name) score += 0.1;
  return Math.min(1, Math.round(score * 100) / 100);
}

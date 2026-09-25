import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';

export interface RecordCallInput {
  readonly mentionId: string;
  readonly mcAt: number | null;
  readonly seenAt: Date;
}

export interface RecordCallResult {
  readonly multiple: number | null;
  readonly mcDelta: number | null;
  readonly isFirst: boolean;
}

function sanitizeMc(mcAt: number | null): number | null {
  if (typeof mcAt !== 'number' || !Number.isFinite(mcAt) || mcAt <= 0) {
    return null;
  }
  return mcAt;
}

function formatMultiple(multiple: number): string {
  const rounded = Math.round(multiple * 100) / 100;
  return `${rounded}x`;
}

/**
 * First-seen tracker for one (kol, contract) pair (Tramo 1, todo 12, P8).
 *
 * Owns its own `first_mc_at` column: the reference market cap is the mc
 * observed on the FIRST mention seen by kol-system, never a canonical
 * `mcAtCall` read from another BC (no canonical assumption — the
 * constraint is structural: this entity has no port to any snapshot or
 * tracking table outside `src/tracking/`).
 *
 * `last_call_mc_at` is the LATEST observed mc (P26: performance compares
 * vs the latest snapshot of (caller, contract); this column carries that
 * value per mention). `times_called` counts mentions (P1: repeats are
 * first-class rows upstream; here they fold into one tracker row per
 * kol+contract).
 */
export class TrackedMention extends AggregateRoot<string> {
  private timesCalledValue: number;
  private firstSeenAtValue: Date;
  private firstMcAtValue: number | null;
  private lastCallMcAtValue: number | null;
  private lastSeenAtValue: Date;
  private lastMentionIdValue: string;

  private constructor(
    id: string,
    private readonly kolIdValue: string,
    private readonly chainValue: string,
    private readonly addressValue: string,
    firstSeenAt: Date,
    firstMcAt: number | null,
    lastMentionId: string,
  ) {
    super(id);
    this.timesCalledValue = 1;
    this.firstSeenAtValue = firstSeenAt;
    this.firstMcAtValue = firstMcAt;
    this.lastCallMcAtValue = firstMcAt;
    this.lastSeenAtValue = firstSeenAt;
    this.lastMentionIdValue = lastMentionId;
  }

  public static buildId(
    kolId: string,
    chain: string,
    address: string,
  ): string {
    // Solana addresses are Base58 case-sensitive; lowercase EVM only
    // (same nuance as ScoredCall — backend-mirror, read-only reference).
    const normalizedAddr =
      chain === 'solana' ? address : address.toLowerCase();
    return `${kolId}:${chain}:${normalizedAddr}`;
  }

  public static create(input: {
    kolId: string;
    chain: string;
    address: string;
    mentionId: string;
    mcAt: number | null;
    seenAt: Date;
  }): TrackedMention {
    if (!input.kolId) {
      throw new DomainError(ErrorCode.VALIDATION, 'kolId must not be empty');
    }
    if (!input.chain) {
      throw new DomainError(ErrorCode.VALIDATION, 'chain must not be empty');
    }
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, 'address must not be empty');
    }
    if (!(input.seenAt instanceof Date)) {
      throw new DomainError(ErrorCode.VALIDATION, 'seenAt must be a Date', {
        mentionId: input.mentionId,
      });
    }
    const normalizedAddr =
      input.chain === 'solana' ? input.address : input.address.toLowerCase();
    return new TrackedMention(
      TrackedMention.buildId(input.kolId, input.chain, input.address),
      input.kolId,
      input.chain,
      normalizedAddr,
      input.seenAt,
      sanitizeMc(input.mcAt),
      input.mentionId,
    );
  }

  /**
   * Folds one more mention of the same kol+contract into this tracker.
   *
   * `first_mc_at` is NEVER overwritten here (reference stability);
   * `last_call_mc_at` always takes the latest observation (null when the
   * latest enrichment produced no market data — the label then degrades
   * to `mc n/a` instead of crashing).
   */
  public recordCall(input: RecordCallInput): RecordCallResult {
    if (!(input.seenAt instanceof Date)) {
      throw new DomainError(ErrorCode.VALIDATION, 'seenAt must be a Date', {
        mentionId: input.mentionId,
      });
    }
    const previousLast = this.lastCallMcAtValue;
    const mcAt = sanitizeMc(input.mcAt);
    this.timesCalledValue += 1;
    this.lastCallMcAtValue = mcAt;
    this.lastSeenAtValue = input.seenAt;
    this.lastMentionIdValue = input.mentionId;
    const multiple = this.multiple;
    const mcDelta =
      mcAt !== null && previousLast !== null ? mcAt - previousLast : null;
    return { multiple, mcDelta, isFirst: false };
  }

  /** Latest mc / first mc — null when either side is missing (no crash). */
  public get multiple(): number | null {
    if (this.firstMcAtValue === null || this.lastCallMcAtValue === null) {
      return null;
    }
    return this.lastCallMcAtValue / this.firstMcAtValue;
  }

  /**
   * Dashboard `tracking` column (P8): `First time` on the first mention,
   * `Nx from last call` afterwards, `mc n/a` when mc is missing.
   */
  public get tracking(): string {
    if (this.timesCalledValue <= 1) {
      return 'First time';
    }
    const multiple = this.multiple;
    if (multiple === null) {
      return 'mc n/a';
    }
    return `${formatMultiple(multiple)} from last call`;
  }

  public get kolId(): string {
    return this.kolIdValue;
  }

  public get chain(): string {
    return this.chainValue;
  }

  public get address(): string {
    return this.addressValue;
  }

  public get timesCalled(): number {
    return this.timesCalledValue;
  }

  public get firstSeenAt(): Date {
    return this.firstSeenAtValue;
  }

  public get firstMcAt(): number | null {
    return this.firstMcAtValue;
  }

  public get lastCallMcAt(): number | null {
    return this.lastCallMcAtValue;
  }

  public get lastSeenAt(): Date {
    return this.lastSeenAtValue;
  }

  public get lastMentionId(): string {
    return this.lastMentionIdValue;
  }

  /**
   * Test-only pin for deterministic fixtures (sets the latest
   * observation without appending a call). Never used in production
   * paths — `recordCall` is the only writer.
   */
  public pinForTest(lastMcAt: number | null, lastSeenAt: Date): void {
    this.lastCallMcAtValue = sanitizeMc(lastMcAt);
    this.lastSeenAtValue = lastSeenAt;
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

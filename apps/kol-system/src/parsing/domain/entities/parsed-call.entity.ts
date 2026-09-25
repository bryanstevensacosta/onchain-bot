import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainEvent } from '../../../shared/kernel/domain-event';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';

export interface ParsedCallProps {
  readonly kolId: string;
  readonly messageId: number;
  /** 0-based occurrence index of this mention within the message (mirrors the candidate). */
  readonly contractIndex: number;
  readonly occurredAt: Date;
  readonly contractAddress: NormalizedAddress;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
  readonly handle: string | null;
  readonly channelId: string | null;
}

/**
 * One structured call per KOL mention (P5: 1:1 with extraction candidates).
 *
 * Override of the backend `TokenCall` collapse behavior: the backend picks
 * `addresses[0]` as the primary contract (`ParsedContract.fromAddresses`)
 * and merges a multi-tip message into ONE call. Here each candidate keeps
 * its OWN address — `parsed.length === candidates.length` always (minus
 * illegible discards, which are logged + skipped, never thrown).
 *
 * Pure-data aggregate (like `ExtractionCandidate`): `mutate` is a no-op;
 * persistence goes through the repository port, never direct DB. No event
 * bus — the use case returns parsed calls directly (fix-1, direct call).
 */
export class ParsedCall extends AggregateRoot<string> {
  private constructor(id: string, private readonly props: ParsedCallProps) {
    super(id);
  }

  public static create(
    input: ParsedCallProps & { id?: string },
  ): ParsedCall {
    if (!input.kolId) {
      throw new DomainError(ErrorCode.VALIDATION, 'kolId must not be empty');
    }
    if (!Number.isInteger(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid messageId: ${input.messageId}`,
        { messageId: input.messageId },
      );
    }
    if (!Number.isInteger(input.contractIndex) || input.contractIndex < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid contractIndex: ${input.contractIndex}`,
        { contractIndex: input.contractIndex },
      );
    }
    if (!input.contractAddress) {
      throw new DomainError(
        ErrorCode.NO_CONTRACT_ADDRESS,
        'Cannot build ParsedCall without a contract address',
        { kolId: input.kolId, messageId: input.messageId },
      );
    }
    const id =
      input.id ?? `${input.kolId}:${input.messageId}:${input.contractIndex}`;
    return new ParsedCall(id, {
      kolId: input.kolId,
      messageId: input.messageId,
      contractIndex: input.contractIndex,
      occurredAt: input.occurredAt,
      contractAddress: input.contractAddress,
      ticker: input.ticker,
      name: input.name,
      chart: input.chart,
      handle: input.handle,
      channelId: input.channelId,
    });
  }

  public get kolId(): string {
    return this.props.kolId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get contractIndex(): number {
    return this.props.contractIndex;
  }

  public get occurredAt(): Date {
    return this.props.occurredAt;
  }

  public get address(): NormalizedAddress {
    return this.props.contractAddress;
  }

  public get chain(): string {
    return this.props.contractAddress.chainHint.value;
  }

  public get ticker(): string | null {
    return this.props.ticker;
  }

  public get name(): string | null {
    return this.props.name;
  }

  public get chart(): string | null {
    return this.props.chart;
  }

  /** KOL ref: who called it (id + handle for the `caller` column). */
  public get kolRef(): { kolId: string; handle: string | null } {
    return { kolId: this.props.kolId, handle: this.props.handle };
  }

  public get handle(): string | null {
    return this.props.handle;
  }

  public get channelId(): string | null {
    return this.props.channelId;
  }

  protected mutate(_event: DomainEvent): void {
    // Pure-data aggregate: no state transitions from events.
  }
}

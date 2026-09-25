import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import { CallApprovalDecidedEvent } from '../events/call-approval.event';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type DecidedBy = 'auto' | 'manual';

export interface CreateCallApprovalInput {
  readonly templateId: string;
  readonly mentionId: string;
  readonly kolId: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker?: string | null;
  readonly score: number;
}

/**
 * Per-template approval for one scored mention (Tramo 1, todo 11, Ph10).
 *
 * One row per (template, mention): id `${templateId}:${mentionId}` so the
 * repo upsert is the double-delivery guard (P1). Rows start `pending`;
 * `EvaluateApprovalUseCase` (auto) or the manual endpoints decide them.
 * The ticker may be null HERE — the non-null invariant is enforced at the
 * publisher boundary (`PublishingJob.create`), never here (backend gap 13
 * nuance: tracking tolerates null, publishing rejects it).
 *
 * P14: `vip-calls` is a template NAME (a datum), never a module — this
 * entity works for every template id uniformly.
 */
export class CallApproval extends AggregateRoot<string> {
  private readonly templateIdValue: string;
  private readonly mentionIdValue: string;
  private readonly kolIdValue: string;
  private readonly chainValue: string;
  private readonly addressValue: string;
  private tickerValue: string | null;
  private readonly scoreValue: number;
  private statusValue: ApprovalStatus = 'pending';
  private reasonValue: string | null = null;
  private decidedByValue: DecidedBy | null = null;
  private decidedAtValue: Date | null = null;
  private readonly createdAt: Date;

  private constructor(
    id: string,
    input: Required<Omit<CreateCallApprovalInput, 'ticker'>> & {
      ticker: string | null;
    },
  ) {
    super(id);
    this.templateIdValue = input.templateId;
    this.mentionIdValue = input.mentionId;
    this.kolIdValue = input.kolId;
    this.chainValue = input.chain;
    this.addressValue = input.address;
    this.tickerValue = input.ticker;
    this.scoreValue = input.score;
    this.createdAt = new Date();
  }

  public static create(input: CreateCallApprovalInput): CallApproval {
    const templateId = (input.templateId ?? '').trim();
    const mentionId = (input.mentionId ?? '').trim();
    if (!templateId) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'templateId must not be empty',
      );
    }
    if (!mentionId) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'mentionId must not be empty',
        { templateId },
      );
    }
    if (!input.chain?.trim() || !input.address?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'chain and address must not be empty',
        { mentionId },
      );
    }
    return new CallApproval(`${templateId}:${mentionId}`, {
      templateId,
      mentionId,
      kolId: input.kolId,
      chain: input.chain,
      address: input.address,
      ticker: input.ticker ?? null,
      score: input.score,
    });
  }

  public get templateId(): string {
    return this.templateIdValue;
  }

  public get mentionId(): string {
    return this.mentionIdValue;
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

  public get ticker(): string | null {
    return this.tickerValue;
  }

  public get score(): number {
    return this.scoreValue;
  }

  public get status(): ApprovalStatus {
    return this.statusValue;
  }

  public get reason(): string | null {
    return this.reasonValue;
  }

  public get decidedBy(): DecidedBy | null {
    return this.decidedByValue;
  }

  public get decidedAt(): Date | null {
    return this.decidedAtValue;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public approve(decidedBy: DecidedBy = 'auto'): void {
    this.guardPending();
    this.statusValue = 'approved';
    this.reasonValue = null;
    this.decidedByValue = decidedBy;
    this.decidedAtValue = new Date();
    this.emit();
  }

  public reject(reason: string, decidedBy: DecidedBy = 'auto'): void {
    this.guardPending();
    if (!reason?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'rejection reason must not be empty',
        { id: this.id },
      );
    }
    this.statusValue = 'rejected';
    this.reasonValue = reason;
    this.decidedByValue = decidedBy;
    this.decidedAtValue = new Date();
    this.emit();
  }

  private guardPending(): void {
    if (this.statusValue !== 'pending') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `approval ${this.id} already decided (${this.statusValue})`,
        {
          id: this.id,
          status: this.statusValue,
        },
      );
    }
  }

  private emit(): void {
    this.apply(
      new CallApprovalDecidedEvent({
        approvalId: this.id,
        templateId: this.templateIdValue,
        mentionId: this.mentionIdValue,
        status: this.statusValue,
        decidedBy: this.decidedByValue ?? 'auto',
        reason: this.reasonValue,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

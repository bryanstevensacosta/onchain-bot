import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { PUBLISH_TARGETS, type PublishTarget } from '../template-target';

/**
 * DB-backed publishing bot (Tramo 2, todo 12, P23-like catalog).
 *
 * DECISION (P23-like catalog vs reusing a telegram bots table): a NEW
 * catalog owned by this BC. Rationale: feed-publisher has NO telegram
 * bots table (env tokens only: `CRYPTO_NEWS_BOT_TOKEN` /
 * `THREADS_BOT_TOKEN`); importing the sibling extraction service
 * catalog would couple the module graphs, and env tokens cannot be
 * managed from the frontend. The token lives ONLY as AES-256-GCM
 * ciphertext; reads are always redacted (`token: '***'`).
 */
export class TemplateBot extends AggregateRoot<string> {
  private readonly labelState: string;
  private readonly targetState: PublishTarget;
  private readonly tokenCiphertextState: string;
  private readonly defaultChatIdState: string | null;
  private verifiedAtState: Date | null;
  private readonly createdAt: Date;

  private constructor(
    id: string,
    label: string,
    target: PublishTarget,
    tokenCiphertext: string,
    defaultChatId: string | null,
  ) {
    super(id);
    this.labelState = label;
    this.targetState = target;
    this.tokenCiphertextState = tokenCiphertext;
    this.defaultChatIdState = defaultChatId;
    this.verifiedAtState = null;
    this.createdAt = new Date();
  }

  public static create(input: {
    id?: string;
    label: string;
    target: PublishTarget;
    tokenCiphertext: string;
    defaultChatId?: string | null;
  }): TemplateBot {
    const label = (input.label ?? '').trim();
    if (!label) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'bot label must not be empty',
      );
    }
    if (!PUBLISH_TARGETS.includes(input.target)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `unknown target: ${input.target}`,
      );
    }
    if (!input.tokenCiphertext) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'bot token ciphertext is required',
      );
    }
    return new TemplateBot(
      (input.id ?? crypto.randomUUID()).trim(),
      label,
      input.target,
      input.tokenCiphertext,
      input.defaultChatId ?? null,
    );
  }

  public get label(): string {
    return this.labelState;
  }

  public get target(): PublishTarget {
    return this.targetState;
  }

  public get tokenCiphertext(): string {
    return this.tokenCiphertextState;
  }

  public get defaultChatId(): string | null {
    return this.defaultChatIdState;
  }

  public get adminVerifiedAt(): Date | null {
    return this.verifiedAtState;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public markChannelVerified(at: Date = new Date()): void {
    this.verifiedAtState = at;
  }

  /** Redacted view for the frontend: ciphertext never leaves the repo. */
  public toRedacted(): {
    readonly id: string;
    readonly label: string;
    readonly target: PublishTarget;
    readonly token: string;
    readonly defaultChatId: string | null;
    readonly adminVerifiedAt: Date | null;
  } {
    return {
      id: this.id,
      label: this.labelState,
      target: this.targetState,
      token: '***',
      defaultChatId: this.defaultChatIdState,
      adminVerifiedAt: this.verifiedAtState,
    };
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

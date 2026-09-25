import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';

/** Redaction marker for bot tokens in every read projection (P23). */
export const REDACTED_TOKEN = '***';

export interface RedactedTelegramBot {
  readonly id: string;
  readonly label: string;
  readonly token: typeof REDACTED_TOKEN;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Reusable bot catalog entry (Tramo 1, todo 10, P23 + P22).
 *
 * One bot publishes for many templates/channels: template A = bot X +
 * channel 1, template B = bot X + channel 2. The token is stored ONLY as
 * AES-256-GCM ciphertext (`encryptedToken`, via `EncryptionService` +
 * per-env `ENCRYPTION_KEY`) — never plaintext, never in env vars (there is
 * NO `KOL_BOT_TOKEN`, not even as seed). Reads project through
 * `toRedacted()` so GET responses carry `'***'` instead of ciphertext.
 */
export class TelegramBot extends AggregateRoot<string> {
  private labelValue: string;
  private ciphertextValue: string;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, label: string, encryptedToken: string) {
    super(id);
    this.labelValue = label;
    this.ciphertextValue = encryptedToken;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  public static create(input: {
    id?: string;
    label: string;
    encryptedToken: string;
  }): TelegramBot {
    const label = (input.label ?? '').trim();
    if (!label) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'bot label must not be empty',
      );
    }
    if (!input.encryptedToken) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'encryptedToken must not be empty (encrypt before persisting)',
        { label },
      );
    }
    const id = (input.id ?? crypto.randomUUID()).trim();
    if (!id) {
      throw new DomainError(ErrorCode.VALIDATION, 'bot id must not be empty');
    }
    return new TelegramBot(id, label, input.encryptedToken);
  }

  public get label(): string {
    return this.labelValue;
  }

  public get encryptedToken(): string {
    return this.ciphertextValue;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public get updatedAtDate(): Date {
    return this.updatedAt;
  }

  public rename(label: string): void {
    if (!label.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'bot label must not be empty',
        {
          botId: this.id,
        },
      );
    }
    this.labelValue = label.trim();
    this.updatedAt = new Date();
  }

  /** Token rotation = replace ciphertext (encrypt before calling). */
  public rotateToken(encryptedToken: string): void {
    if (!encryptedToken) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'encryptedToken must not be empty',
        {
          botId: this.id,
        },
      );
    }
    this.ciphertextValue = encryptedToken;
    this.updatedAt = new Date();
  }

  /** Read projection: token is ALWAYS `'***'` (P23 redact). */
  public toRedacted(): RedactedTelegramBot {
    return {
      id: this.id,
      label: this.labelValue,
      token: REDACTED_TOKEN,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

import { AggregateRoot } from '../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';

/** Redaction marker for bot tokens in every read projection. */
export const REDACTED_TOKEN = '***';

export interface RedactedBotVaultEntry {
  readonly id: string;
  readonly label: string;
  readonly token: typeof REDACTED_TOKEN;
  readonly ownerApp: string;
  readonly createdAt: Date;
  readonly rotatedAt: Date | null;
}

/**
 * Vault catalog entry (todo 1): one bot serves many apps.
 * Token stored ONLY as AES-256-GCM ciphertext (`encryptedToken` via
 * `EncryptionService` + per-env `ENCRYPTION_KEY`) — never plaintext.
 * Reads project through `toRedacted()` (`'***'`, ciphertext never leaves).
 * Rotation = ciphertext swap + `rotatedAt`, no redeploy.
 */
export class BotVaultEntry extends AggregateRoot<string> {
  private labelValue: string;
  private ciphertextValue: string;
  private readonly ownerAppValue: string;
  private readonly createdAt: Date;
  private rotatedAt: Date | null;

  private constructor(input: {
    id: string;
    label: string;
    encryptedToken: string;
    ownerApp: string;
  }) {
    super(input.id);
    this.labelValue = input.label;
    this.ciphertextValue = input.encryptedToken;
    this.ownerAppValue = input.ownerApp;
    this.createdAt = new Date();
    this.rotatedAt = null;
  }

  public static create(input: {
    id?: string;
    label: string;
    encryptedToken: string;
    ownerApp: string;
  }): BotVaultEntry {
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
    const ownerApp = (input.ownerApp ?? '').trim();
    if (!ownerApp) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ownerApp must not be empty',
        { label },
      );
    }
    const id = (input.id ?? crypto.randomUUID()).trim();
    if (!id) {
      throw new DomainError(ErrorCode.VALIDATION, 'bot id must not be empty');
    }
    return new BotVaultEntry({
      id,
      label,
      encryptedToken: input.encryptedToken,
      ownerApp,
    });
  }

  public get label(): string {
    return this.labelValue;
  }

  public get encryptedToken(): string {
    return this.ciphertextValue;
  }

  public get ownerApp(): string {
    return this.ownerAppValue;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public get rotatedAtDate(): Date | null {
    return this.rotatedAt;
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
  }

  /** Token rotation = replace ciphertext (encrypt before calling). No redeploy. */
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
    this.rotatedAt = new Date();
  }

  /** Read projection: token is ALWAYS `'***'`. */
  public toRedacted(): RedactedBotVaultEntry {
    return {
      id: this.id,
      label: this.labelValue,
      token: REDACTED_TOKEN,
      ownerApp: this.ownerAppValue,
      createdAt: this.createdAt,
      rotatedAt: this.rotatedAt,
    };
  }
}

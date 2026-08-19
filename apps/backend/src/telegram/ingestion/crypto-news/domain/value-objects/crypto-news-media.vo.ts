/**
 * Value object representing a single media attachment (photo or video)
 * downloaded from a Telegram crypto-news message.
 *
 * Strict VO: `create()` throws `DomainError(VALIDATION)` on invalid input.
 * Callers (e.g. `StoreNewsMessageUseCase`) are expected to catch and
 * log+discard invalid media so a single bad attachment cannot break the
 * ingestion of the parent message.
 *
 * `reconstitute()` skips validation and is reserved for hydration from
 * persistence (mapper layer).
 */
import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type CryptoNewsMediaType = 'photo' | 'video' | 'webpage';

export interface CryptoNewsMediaProps {
  readonly index: number;
  readonly type: CryptoNewsMediaType;
  readonly filePath: string;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
}

export class CryptoNewsMedia extends ValueObject<CryptoNewsMediaProps> {
  protected constructor(props: CryptoNewsMediaProps) {
    super(props);
  }

  public static create(input: {
    index: number;
    type: CryptoNewsMediaType;
    filePath: string;
    mimeType: string | null;
    fileSize: number | null;
  }): CryptoNewsMedia {
    if (!Number.isFinite(input.index) || input.index < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'CryptoNewsMedia index must be a non-negative number',
        { index: input.index },
      );
    }
    if (!input.filePath || input.filePath.trim().length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'CryptoNewsMedia filePath cannot be empty',
        { filePath: input.filePath },
      );
    }
    return new CryptoNewsMedia({
      index: input.index,
      type: input.type,
      filePath: input.filePath,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
    });
  }

  public static reconstitute(props: CryptoNewsMediaProps): CryptoNewsMedia {
    return new CryptoNewsMedia(props);
  }

  public get index(): number {
    return this.props.index;
  }

  public get type(): CryptoNewsMediaType {
    return this.props.type;
  }

  public get filePath(): string {
    return this.props.filePath;
  }

  public get mimeType(): string | null {
    return this.props.mimeType;
  }

  public get fileSize(): number | null {
    return this.props.fileSize;
  }
}

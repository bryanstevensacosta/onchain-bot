import * as crypto from 'node:crypto';

/**
 * AdMediaLibraryEntry (Tramo 2, todo 6).
 *
 * One row per uploaded library asset, stored canonically under
 * `uploads/ads-library/<contentHash><ext>` (Opcion B: the library
 * lives in the feed-publisher app root, not the backend).
 *
 * Deliberately FK-less: library rows outlive any scheduled ad that
 * references them (deduped by `contentHash`, so many ads may share
 * one row). Immutable value object.
 */
export interface AdMediaLibraryEntryProps {
  readonly id: string;
  readonly filePath: string;
  readonly contentHash: string;
  readonly originalFileName: string | null;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
  readonly createdAt: Date;
}

export class AdMediaLibraryEntry {
  private constructor(private readonly props: AdMediaLibraryEntryProps) {}

  public static create(input: {
    id?: string;
    filePath: string;
    contentHash: string;
    originalFileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
    createdAt?: Date;
  }): AdMediaLibraryEntry {
    return new AdMediaLibraryEntry({
      id: input.id ?? crypto.randomUUID(),
      filePath: input.filePath,
      contentHash: input.contentHash,
      originalFileName: input.originalFileName ?? null,
      mimeType: input.mimeType ?? null,
      fileSize: input.fileSize ?? null,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  public static fromSnapshot(
    props: AdMediaLibraryEntryProps,
  ): AdMediaLibraryEntry {
    return new AdMediaLibraryEntry(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public get filePath(): string {
    return this.props.filePath;
  }

  public get contentHash(): string {
    return this.props.contentHash;
  }

  public get originalFileName(): string | null {
    return this.props.originalFileName;
  }

  public get mimeType(): string | null {
    return this.props.mimeType;
  }

  public get fileSize(): number | null {
    return this.props.fileSize;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }
}

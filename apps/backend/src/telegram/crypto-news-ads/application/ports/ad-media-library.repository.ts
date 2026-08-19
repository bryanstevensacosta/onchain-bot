/**
 * Cross-layer DTO for ad-media-library persistence.
 *
 * The crypto-news-ads BC has no domain aggregate for the media library — the
 * ORM entity (`AdMediaLibraryEntity`) stays in infrastructure.
 * `AdMediaLibraryRecord` is the port's contract between the application and
 * persistence layers.
 */
export interface AdMediaLibraryRecord {
  id: string;
  filePath: string;
  contentHash: string;
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: Date;
}

/**
 * Outbound port: persistence for the shared ad-media library.
 *
 * Unlike `AdMediaRepository`, the library is NOT keyed to a parent ad — rows
 * are deduplicated by `contentHash` and outlive any ad that references them.
 * Hence there is no `findByAdId`/`deleteByAdId` here, only `findById`,
 * `findByContentHash`, `findAll`, and `delete`. `delete` exists on the port
 * for backfill/test use only — NO HTTP controller or UI route exposes it
 * (library rows are permanently retained by design).
 */
export abstract class AdMediaLibraryRepository {
  /** Upsert semantics via TypeORM `save` (insert or update on id conflict). */
  public abstract save(
    record: AdMediaLibraryRecord,
  ): Promise<AdMediaLibraryRecord>;
  public abstract findById(id: string): Promise<AdMediaLibraryRecord | null>;
  public abstract findByContentHash(
    hash: string,
  ): Promise<AdMediaLibraryRecord | null>;
  public abstract findAll(): Promise<ReadonlyArray<AdMediaLibraryRecord>>;
  public abstract delete(id: string): Promise<void>;
}

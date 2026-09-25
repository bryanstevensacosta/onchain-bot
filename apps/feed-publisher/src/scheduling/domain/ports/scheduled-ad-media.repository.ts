/**
 * Per-post media attachment row (one file stored under
 * `uploads/ads/<adId>/<uuid>.<ext>`). The domain `ScheduledAd` only
 * keeps the media ids; these rows resolve them to disk paths.
 */
export interface ScheduledAdMediaRecord {
  readonly id: string;
  readonly adId: string;
  readonly filePath: string;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
  readonly createdAt: Date;
}

/** Outbound port: per-post media attachments (cascade-deleted with the post). */
export abstract class ScheduledAdMediaRepository {
  public abstract findById(id: string): Promise<ScheduledAdMediaRecord | null>;
  public abstract save(
    record: ScheduledAdMediaRecord,
  ): Promise<ScheduledAdMediaRecord>;
  public abstract delete(id: string): Promise<void>;
}

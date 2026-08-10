/**
 * Cross-layer DTO for ad media persistence.
 *
 * The crypto-news-ads BC has no domain aggregate for media — the ORM entity
 * (`AdMediaEntity`) stays in infrastructure. `AdMediaRecord` is the port's
 * contract between the application and persistence layers.
 */
export interface AdMediaRecord {
  id: string;
  adId: string;
  filePath: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: Date;
}

/**
 * Outbound port: persistence for crypto-news ad media attachments.
 *
 * One image per ad (`UNIQUE (ad_id)` at the DB level) — `findByAdId` and
 * `deleteByAdId` are single-row operations keyed on the parent ad.
 */
export abstract class AdMediaRepository {
  /** Upsert semantics via TypeORM `save` (insert or update on id conflict). */
  public abstract save(media: AdMediaRecord): Promise<AdMediaRecord>;
  public abstract findById(id: string): Promise<AdMediaRecord | null>;
  public abstract findByAdId(adId: string): Promise<AdMediaRecord | null>;
  public abstract delete(id: string): Promise<void>;
  public abstract deleteByAdId(adId: string): Promise<void>;
}

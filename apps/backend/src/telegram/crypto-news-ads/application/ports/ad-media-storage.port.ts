/**
 * Outbound port: disk storage for crypto-news ad image attachments.
 *
 * Files live under the configured uploads root. The port speaks only
 * RELATIVE paths (relative to the uploads root) so the application
 * layer never touches absolute filesystem paths — `store` returns a
 * relative path that is persisted in the `crypto_news_ad_media` table,
 * and `remove` accepts exactly the relative path this port returned.
 */
export abstract class AdMediaStoragePort {
  /**
   * Persist `buffer` as an image attachment for `adId` under
   * `<uploadsRoot>/crypto-news-ads/<adId>/<uuid>.<ext>`.
   *
   * `mimeType` is the MIME sniffed by the caller (never client-supplied)
   * and drives the file extension. Returns the written file's path
   * RELATIVE to the uploads root (forward slashes) plus its byte size.
   */
  public abstract store(
    adId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ relativePath: string; size: number }>;

  /**
   * Delete the file at `relativePath` (relative to the uploads root).
   * Removing a file that is already absent is a no-op.
   */
  public abstract remove(relativePath: string): Promise<void>;
}

/**
 * @deprecated Moved to apps/feed-publisher/src/scheduling/ (Tramo 2, todo 6 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add scheduling/ads logic in apps/feed-publisher/src/scheduling/ instead.
 */
/**
 * Read view for one media-library entry (served under
 * `GET /crypto-news-ads/media-library`).
 */
export interface AdMediaLibraryEntryView {
  readonly id: string;
  readonly url: string;
  readonly originalFileName: string | null;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
  readonly createdAt: Date;
}

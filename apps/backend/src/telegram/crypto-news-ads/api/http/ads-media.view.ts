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

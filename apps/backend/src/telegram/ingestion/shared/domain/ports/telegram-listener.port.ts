export abstract class TelegramListenerPort {
  public abstract subscribe(
    channelIds: string[],
  ): AsyncIterable<TelegramRawMessage>;
  public abstract backfill(
    channelId: string,
    limit: number,
  ): Promise<TelegramRawMessage[]>;
  public abstract disconnect(): Promise<void>;
  public abstract resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata>;
  public abstract joinChannel(peerId: string): Promise<JoinChannelResult>;
}

export interface ResolvedChannelMetadata {
  readonly peerId: string;
  readonly title: string;
  readonly handle: string | null;
  readonly kind: 'channel' | 'user' | 'unknown';
}

export interface JoinChannelResult {
  readonly joined: boolean;
  readonly wasAlreadyMember: boolean;
  readonly error?: string;
}

/**
 * Metadata for downloading a photo attached to a Telegram message. This
 * starts as POINTER data only — `fileId`, `accessHash`, and `fileReference`
 * are what Telegram needs to fetch the bytes. The listener populates the
 * `filePath`, `fileSize`, and `index` fields after the bytes have been
 * successfully downloaded to disk via the `mediaDownloader` port; for
 * backfill / metadata-only paths (where no download is attempted) those
 * fields remain `undefined`.
 *
 * IMPORTANT: Telegram's `fileReference` expires after roughly 1 hour. The
 * image bytes MUST be downloaded from Telegram at ingestion time and stored
 * locally before any pointer in this struct leaves the ingestion path. Do
 * not defer the download, persist these fields alone, or assume the
 * reference is still valid later.
 */
export interface TelegramMediaAttachment {
  readonly type: 'photo';
  readonly fileId: bigint | string;
  readonly accessHash: bigint | string;
  readonly fileReference: string;
  readonly mimeType: string | null;
  // Populated AFTER successful download by the listener. Undefined if
  // download has not yet completed (e.g., for backfill metadata only).
  readonly filePath?: string;
  readonly fileSize?: number | null;
  readonly index?: number;
}

export interface TelegramRawMessage {
  readonly peerId: string;
  readonly messageId: number;
  readonly text: string;
  readonly occurredAt: Date;
  readonly entities?: ReadonlyArray<{
    readonly type: string;
    readonly offset: number;
    readonly length: number;
    readonly url?: string;
  }>;
  readonly media?: ReadonlyArray<TelegramMediaAttachment>;
}

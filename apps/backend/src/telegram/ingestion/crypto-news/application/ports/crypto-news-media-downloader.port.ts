import { TelegramMediaAttachment } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

/**
 * Result of a successful media download — bytes are already on disk and the
 * returned `filePath` is the absolute path of the written file.
 *
 * `mimeType` and `fileSize` come from the actual downloaded bytes (magic-byte
 * detection + `Buffer.length`), not from Telegram's hint on the attachment.
 * They may be `null` for unknown content types.
 */
export interface DownloadedMedia {
  readonly filePath: string;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
}

/**
 * Port: download a single Telegram media attachment to local disk and return
 * the resolved local path + detected MIME type.
 *
 * Implementations are responsible for:
 *   - Sanitising `channelId` against path traversal before joining it into a
 *     filesystem path.
 *   - Detecting the real MIME type from the downloaded bytes (not from the
 *     attachment's declared MIME, which Telegram does not provide for photos).
 *   - Wrapping every `client.downloadMedia()` call with a flood-wait retry.
 *   - Enforcing a maximum-size cap; oversized downloads are discarded.
 *   - Returning the local path as an absolute path on disk.
 *
 * This port is invoked synchronously from the Telegram listener so the
 * `TelegramRawMessage` that leaves the listener already has a non-null
 * `filePath` for each attachment. Telegram's `fileReference` expires after
 * ~1 hour, so deferring the download to a later stage would lose the image.
 */
export abstract class CryptoNewsMediaDownloader {
  /** Legacy path: reconstruct a `MessageMediaPhoto` from the extracted
   *  attachment fields and try to download. Only works when the photo
   *  has `sizes` available — prefer `downloadFromRaw` for live messages
   *  where the original `msg.media` object includes all gramjs fields. */
  public abstract download(
    channelId: string,
    messageId: number,
    index: number,
    media: TelegramMediaAttachment,
  ): Promise<DownloadedMedia>;

  /** Save a pre-downloaded buffer to disk (MIME detection, path
   *  sanitisation, size cap) without re-downloading. Used when the
   *  caller (e.g. the live Telegram listener) already called
   *  `client.downloadMedia()` with the original `msg.media` object
   *  and just needs the disk-persist + metadata steps. */
  public abstract saveToDisk(
    channelId: string,
    messageId: number,
    index: number,
    media: TelegramMediaAttachment,
    buffer: Buffer,
  ): Promise<DownloadedMedia>;
}

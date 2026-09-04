import { promises as fs } from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'telegram';
import bigInt from 'big-integer';
import sharp from 'sharp';
import type { AppConfig } from 'shared/common/config/app.config';
import {
  CryptoNewsMediaDownloader,
  DownloadedMedia,
} from 'telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port';
import type { TelegramMediaAttachment } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { FloodWaitHandlerService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service';

/** Maximum bytes accepted from a single Telegram media download (50 MB). */
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/**
 * Telegram Bot API limit for photo uploads is 10 MB.
 * We compress at 9 MB to leave a safety margin for metadata overhead.
 */
const BOT_API_PHOTO_UPLOAD_LIMIT = 9 * 1024 * 1024;

/** Max dimension for compressed images (preserves aspect ratio). */
const MAX_COMPRESS_DIMENSION = 1920;

/** JPEG quality for compressed output (0-100). */
const COMPRESS_QUALITY = 80;

/**
 * Regex used to sanitise channel IDs before they are joined into a
 * filesystem path. Anything outside `[A-Za-z0-9_-]` (e.g. leading `@`,
 * dots, slashes) is replaced with `_` to defeat path traversal.
 */
const SAFE_CHANNEL_ID_PATTERN = /[^a-zA-Z0-9_-]/g;

/**
 * MTProto adapter for {@link CryptoNewsMediaDownloader}.
 *
 * Downloads a single Telegram media attachment (photo or video) to
 * local disk using the shared `TelegramClient` owned by the listener.
 * Each `downloadMedia` call is wrapped with
 * `FloodWaitHandlerService.withRetry()` so a transient FLOOD_WAIT does
 * not lose the message; on
 * `FILE_REFERENCE_EXPIRED` we re-fetch the message to refresh the
 * `fileReference` and retry once.
 *
 * The client is injected as a closure (`getClient`) because the
 * `TelegramClient` is created lazily by the listener at subscribe time
 * and is not itself a NestJS provider — there is no global client to
 * register as a provider.
 *
 * @deprecated This adapter is deprecated and will be removed in a future version.
 *
 * **Reason for deprecation:**
 * Media download logic has been centralized into the ingestion service to eliminate 3x
 * duplication of downloaded files across backend environments. With distributed MTProto
 * clients, each environment downloads the same media files independently, wasting bandwidth,
 * storage, and Telegram API quota.
 *
 * **Migration path:**
 * - **New location:** `apps/ingestion-service/src/telegram/crypto-news/infrastructure/api/mtproto/mtproto-media-downloader.ts`
 * - **Backend replacement:** Backend clients receive media URLs via SSE instead of local file
 *   paths. Media is accessed via HTTP endpoints like `GET /api/media/:channelId/:messageId/:index`
 *   served by the centralized ingestion service.
 * - **Message payload change:** The `TelegramRawMessage.media[].filePath` field now contains
 *   an HTTP URL (e.g., `http://ingestion-service:3031/api/media/-100.../12345/0`) instead of
 *   a local filesystem path.
 *
 * **What moved to ingestion service:**
 * - Synchronous media download at ingestion time (fileReference expires in ~1h)
 * - FLOOD_WAIT retry logic for download operations (Requirement 11.2)
 * - FILE_REFERENCE_EXPIRED detection and message re-fetch for fileReference refresh
 * - Channel ID sanitization for filesystem path safety (defeats path traversal)
 * - 50MB size limit enforcement and buffer validation
 * - Photo compression for Bot API upload compatibility (10MB limit)
 * - MIME type detection via magic bytes (not Telegram-declared type)
 * - Storage in persistent volume at `uploads/crypto-news/media/{channelId}/`
 *
 * **Backend client behavior:**
 * When `INGESTION_MODE=remote`, backends no longer download media. The `SseIngestionClientAdapter`
 * constructs `TelegramRawMessage` objects with media URLs in the `filePath` field. Backends can:
 * 1. Display URLs directly in the dashboard (images load via HTTP)
 * 2. Download on-demand via HTTP GET if local processing is needed
 * 3. Pass URLs to LLM providers that support image URLs
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Requirement 1.2 (media downloaded once) and section 4.2 (media serving endpoint design).
 *
 * @see {@link apps/ingestion-service} Centralized media download eliminates 3x duplication
 */
@Injectable()
export class MtprotoMediaDownloader extends CryptoNewsMediaDownloader {
  private readonly logger = new Logger(MtprotoMediaDownloader.name);

  constructor(
    private readonly getClient: () => TelegramClient | null,
    private readonly floodWaitHandler: FloodWaitHandlerService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  public async download(
    channelId: string,
    messageId: number,
    index: number,
    media: TelegramMediaAttachment,
  ): Promise<DownloadedMedia> {
    const client = this.getClient();
    if (!client) {
      throw new Error('Telegram MTProto client is not initialised');
    }

    const buffer = await this.downloadWithOptionalRefresh(
      client,
      channelId,
      messageId,
      media,
    );

    if (!(buffer instanceof Buffer) || buffer.length === 0) {
      throw new Error(
        `Telegram returned empty media for ${channelId}:${messageId}`,
      );
    }

    return this.doSaveToDisk(channelId, messageId, index, media, buffer);
  }

  public async saveToDisk(
    channelId: string,
    messageId: number,
    index: number,
    media: TelegramMediaAttachment,
    buffer: Buffer,
  ): Promise<DownloadedMedia> {
    if (buffer.length === 0) {
      throw new Error(
        `Cannot save empty media buffer for ${channelId}:${messageId}`,
      );
    }
    return this.doSaveToDisk(channelId, messageId, index, media, buffer);
  }

  private async doSaveToDisk(
    channelId: string,
    messageId: number,
    index: number,
    _media: TelegramMediaAttachment,
    buffer: Buffer,
  ): Promise<DownloadedMedia> {
    const safeChannelId = channelId.replace(SAFE_CHANNEL_ID_PATTERN, '_');
    const uploadsRoot = this.resolveUploadsRoot();
    const targetDir = path.join(
      uploadsRoot,
      'crypto-news',
      'media',
      safeChannelId,
    );
    await fs.mkdir(targetDir, { recursive: true });

    if (buffer.length > MAX_MEDIA_BYTES) {
      this.logger.warn(
        `Media for ${channelId}:${messageId} exceeds ${MAX_MEDIA_BYTES} bytes ` +
          `(got ${buffer.length}) — discarding without writing to disk`,
      );
      throw new Error(
        `Media exceeds maximum allowed size of ${MAX_MEDIA_BYTES} bytes`,
      );
    }

    const { mimeType, ext } = detectMimeAndExt(buffer);

    // Compress before saving if the image exceeds Bot API upload limits
    let outputBuffer = await compressIfImageExceedsLimit(buffer, mimeType);

    // Transcode video to HEVC (H.265) for better compression and Telegram compatibility
    let finalExt = ext;
    if (mimeType.startsWith('video/')) {
      outputBuffer = await transcodeToHevc(outputBuffer, this.logger);
      finalExt = 'mp4'; // HEVC always uses .mp4 container
    }

    const filePath = path.join(targetDir, `${messageId}_${index}.${finalExt}`);
    // Permanent orphan fix (1) transactional + (2) dedup: check existing by hash, write to tmp then finalize
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(outputBuffer).digest('hex');
    const dedupPath = path.join(targetDir, `${hash}.${finalExt}`);
    try {
      await fs.access(dedupPath);
      // Dedup hit — reuse existing file without writing duplicate
      this.logger.log(
        `Media dedup hit for ${channelId}:${messageId} hash=${hash.slice(0, 8)}`,
      );
      return { filePath: dedupPath, mimeType, fileSize: outputBuffer.length };
    } catch (_e) {
      // dedup miss, continue to tmp write
    }
    const tmpPath = `${filePath}.tmp-${hash.slice(0, 8)}`;
    await fs.writeFile(tmpPath, outputBuffer);
    try {
      await fs.rename(tmpPath, filePath);
    } catch (_e2) {
      await fs.unlink(tmpPath).catch(() => {});
      throw new Error(
        `Failed to finalize media file for ${channelId}:${messageId}`,
      );
    }

    return { filePath, mimeType, fileSize: outputBuffer.length };
  }

  private resolveUploadsRoot(): string {
    const cfg = this.config.get<AppConfig>('app');
    const raw = cfg?.uploadsRoot;
    if (raw && raw.trim().length > 0) return raw;
    return path.join(process.cwd(), 'uploads');
  }

  /**
   * Wraps `client.downloadMedia` with `FloodWaitHandlerService.withRetry()`.
   *
   * On `FILE_REFERENCE_EXPIRED` (or `FILEREF_UPGRADE_NEEDED`) we re-fetch
   * the message via `client.getMessages(channelId, { ids: [messageId] })`
   * to obtain a fresh `fileReference`, then retry the download once.
   * If the refresh or second attempt fails, the error is re-thrown to the
   * caller (the listener logs and discards media for that message).
   */
  private async downloadWithOptionalRefresh(
    client: TelegramClient,
    channelId: string,
    messageId: number,
    media: TelegramMediaAttachment,
  ): Promise<Buffer> {
    const photoMedia = this.buildPhotoMedia(media);

    try {
      return await this.runDownload(client, photoMedia);
    } catch (err) {
      if (!isRefreshableError(err)) {
        throw err;
      }

      this.logger.warn(
        `fileReference expired for ${channelId}:${messageId} — attempting refresh`,
      );

      const refreshed = await this.refreshPhotoMedia(
        client,
        channelId,
        messageId,
      );
      if (!refreshed) {
        throw err;
      }

      return await this.runDownload(client, refreshed);
    }
  }

  private async runDownload(
    client: TelegramClient,
    photoMedia: Api.MessageMediaPhoto,
  ): Promise<Buffer> {
    const result = await this.floodWaitHandler.withRetry('media-download', () =>
      client.downloadMedia(photoMedia, {}),
    );

    if (result === undefined) {
      throw new Error('Telegram downloadMedia returned undefined');
    }
    if (typeof result === 'string') {
      // gramjs writes to disk only when outputFile is set; we never set it,
      // so a string return is unexpected. Treat as an error.
      throw new Error(
        `Telegram downloadMedia returned unexpected path: ${result}`,
      );
    }
    return result;
  }

  private buildPhotoMedia(
    media: TelegramMediaAttachment,
  ): Api.MessageMediaPhoto {
    const fileReference = Buffer.from(media.fileReference, 'base64');
    const photo = new Api.Photo({
      id: coerceToLong(media.fileId),
      accessHash: coerceToLong(media.accessHash),
      fileReference,
      date: media.date ?? 0,
      sizes: [],
      dcId: media.dcId ?? 0,
    });
    return new Api.MessageMediaPhoto({ photo });
  }

  private async refreshPhotoMedia(
    client: TelegramClient,
    channelId: string,
    messageId: number,
  ): Promise<Api.MessageMediaPhoto | null> {
    try {
      const messages = await this.floodWaitHandler.withRetry(
        'media-refresh',
        () => client.getMessages(channelId, { ids: [messageId] }),
      );
      const first = (
        messages as unknown as Array<{
          media?: Api.MessageMediaPhoto;
        }>
      )[0];
      const refreshedPhoto = first?.media?.photo;
      if (!refreshedPhoto) return null;
      return new Api.MessageMediaPhoto({ photo: refreshedPhoto });
    } catch (err) {
      this.logger.warn(
        `Could not refresh fileReference for ${channelId}:${messageId}: ${
          (err as Error).message
        }`,
      );
      return null;
    }
  }
}

function coerceToLong(value: bigint | string): bigInt.BigInteger {
  if (typeof value === 'bigint') return bigInt(value.toString());
  return bigInt(String(value));
}

function isRefreshableError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  return (
    msg.includes('FILE_REFERENCE_EXPIRED') ||
    msg.includes('FILEREF_UPGRADE_NEEDED') ||
    msg.includes('FILE_REFERENCE_INVALID')
  );
}

/**
 * Detect MIME type and file extension from the first bytes of the
 * downloaded buffer (magic-byte sniffing). Telegram photos arrive as
 * JPEG, PNG, GIF or WEBP; videos as MP4/MOV/WebM; everything else falls
 * back to `application/octet-stream`.
 */
function detectMimeAndExt(buffer: Buffer): {
  mimeType: string;
  ext: string;
} {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return { mimeType: 'image/gif', ext: 'gif' };
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  // Video magic bytes detection
  // MP4/MOV: 'ftyp' box at offset 4 (first 4 bytes = size, then 'ftyp')
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 && // 'f'
    buffer[5] === 0x74 && // 't'
    buffer[6] === 0x79 && // 'y'
    buffer[7] === 0x70 // 'p'
  ) {
    return { mimeType: 'video/mp4', ext: 'mp4' };
  }
  // WebM: EBML header starts with 0x1a 0x45 0xdf 0xa3
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { mimeType: 'video/webm', ext: 'webm' };
  }
  // MPEG-TS: sync byte 0x47 repeating every 188 bytes (basic check)
  if (buffer.length >= 188 && buffer[0] === 0x47 && buffer[188] === 0x47) {
    return { mimeType: 'video/mp2t', ext: 'ts' };
  }
  return { mimeType: 'application/octet-stream', ext: 'bin' };
}

async function compressIfImageExceedsLimit(
  buffer: Buffer,
  mimeType: string,
): Promise<Buffer> {
  if (buffer.length <= BOT_API_PHOTO_UPLOAD_LIMIT) {
    return buffer;
  }
  if (!isCompressibleMime(mimeType)) {
    return buffer;
  }
  return sharp(buffer)
    .jpeg({ quality: COMPRESS_QUALITY })
    .resize({
      width: MAX_COMPRESS_DIMENSION,
      height: MAX_COMPRESS_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .withMetadata()
    .toBuffer();
}

function isCompressibleMime(mimeType: string): boolean {
  return (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp'
  );
}

/**
 * Transcode video to HEVC (H.265) using ffmpeg.
 * Uses libx265 with CRF 28 and fast preset, copies audio stream.
 * Falls back to original buffer on any error.
 */
async function transcodeToHevc(
  buffer: Buffer,
  logger: Logger,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve) => {
    const inputArgs = ['-i', 'pipe:0'];
    const outputArgs = [
      '-c:v',
      'libx265',
      '-crf',
      '28',
      '-preset',
      'fast',
      '-c:a',
      'copy',
      '-f',
      'mp4',
      'pipe:1',
    ];

    const ffmpeg = execFile('ffmpeg', [...inputArgs, ...outputArgs], {
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer for output
      timeout: 120000, // 2 minute timeout
    });

    const outputChunks: Buffer[] = [];
    let errorOutput = '';

    ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      outputChunks.push(chunk);
    });

    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });

    ffmpeg.on('error', (err) => {
      logger.warn(
        `HEVC transcoding failed (ffmpeg spawn error): ${err.message} — falling back to original`,
      );
      resolve(buffer);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0 && outputChunks.length > 0) {
        const transcoded = Buffer.concat(outputChunks);
        if (transcoded.length > 0) {
          logger.log(
            `HEVC transcoding succeeded: ${buffer.length} -> ${transcoded.length} bytes (${((1 - transcoded.length / buffer.length) * 100).toFixed(1)}% reduction)`,
          );
          resolve(transcoded);
          return;
        }
      }
      logger.warn(
        `HEVC transcoding failed (exit code ${code}): ${errorOutput || 'no output'} — falling back to original`,
      );
      resolve(buffer);
    });

    // Write input buffer to ffmpeg stdin
    ffmpeg.stdin?.write(buffer);
    ffmpeg.stdin?.end();
  });
}

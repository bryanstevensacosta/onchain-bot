import * as path from 'node:path';
import type { Request, Response } from 'express';

/**
 * Shared HTTP media serving helpers for the dashboard's media endpoints.
 *
 * Two concerns live here because both are needed together:
 *  1. `detectMediaMimeType` — resolve the real MIME type of a media file.
 *     Magic-byte sniffing covers MP4/MOV (which the download-time sniffer in
 *     `mtproto-media-downloader.ts` misses, so videos persist as
 *     `application/octet-stream` + `.bin`), falling back to the DB value
 *     and then the file extension.
 *  2. `serveMediaFile` — stream a buffer with HTTP Range support (206
 *     Partial Content), which browsers require for seeking in `<video>`.
 */

const EXT_MIME_MAP: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  bin: 'application/octet-stream',
};

/**
 * Sniff the MIME type from the first bytes of a media buffer.
 * Covers the image formats the downloader already detects, plus MP4/MOV
 * (ISO BMFF `ftyp` box at offset 4) which it misses.
 */
export function sniffMimeFromBytes(buffer: Buffer): string | null {
  if (buffer.length < 3) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
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
    return 'image/webp';
  }
  // ISO BMFF (MP4/MOV): size(4) + 'ftyp' at offset 4
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    // Brand at offset 8: 'qt  ' → QuickTime MOV, otherwise MP4
    const isQuickTime =
      buffer.length >= 12 &&
      buffer[8] === 0x71 &&
      buffer[9] === 0x74 &&
      buffer[10] === 0x20 &&
      buffer[11] === 0x20;
    return isQuickTime ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

/**
 * Resolve the MIME type for a media file, in priority order:
 *  1. A non-octet-stream value persisted in the DB (already magic-byte
 *     detected at download time and trustworthy).
 *  2. Magic-byte sniffing of the actual buffer (recovers MP4/MOV that were
 *     stored as `application/octet-stream`).
 *  3. File-extension map.
 *  4. `application/octet-stream` as the final fallback.
 */
export function detectMediaMimeType(
  filePath: string,
  mimeTypeFromDb: string | null,
  buffer: Buffer,
): string {
  if (
    mimeTypeFromDb &&
    mimeTypeFromDb.trim().length > 0 &&
    mimeTypeFromDb !== 'application/octet-stream'
  ) {
    return mimeTypeFromDb;
  }
  const sniffed = sniffMimeFromBytes(buffer);
  if (sniffed) return sniffed;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_MIME_MAP[ext] ?? 'application/octet-stream';
}

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Parse a single-range `Range: bytes=...` header (RFC 9110 §14.1.2).
 * Returns `null` when the header is absent, malformed, or carries multiple
 * ranges — callers then serve the full 200 response.
 */
export function parseRangeHeader(
  rangeHeader: string | undefined,
  fileSize: number,
): ByteRange | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return null;

  if (startStr === '') {
    // Suffix range: last N bytes (`bytes=-500`)
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, fileSize - suffix), end: fileSize - 1 };
  }

  const start = parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0) return null;

  if (endStr === '') {
    // Open-ended range (`bytes=100-`)
    return { start, end: fileSize - 1 };
  }

  const end = parseInt(endStr, 10);
  if (!Number.isFinite(end)) return null;
  return { start, end };
}

/**
 * Send a media buffer honouring an optional `Range` request header.
 *
 * - No range / unparseable range → 200 with the full body.
 * - Satisfiable range → 206 with `Content-Range`, sliced body, and
 *   `Accept-Ranges: bytes` (needed for `<video>` seeking).
 * - Unsatisfiable range (`start >= size`) → 416 with a
 *   `Content-Range: bytes * / size` header (the literal `* /` written
 *   with a space so it cannot close this block comment).
 */
export function serveMediaFile(
  res: Response,
  req: Request,
  fileBuffer: Buffer,
  mimeType: string,
  cacheControl: string,
): void {
  const fileSize = fileBuffer.length;
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', cacheControl);

  const range = parseRangeHeader(req.headers.range, fileSize);
  if (!range) {
    res.setHeader('Content-Length', fileSize.toString());
    res.status(200).send(fileBuffer);
    return;
  }

  if (range.start >= fileSize || range.start > range.end) {
    res.setHeader('Content-Range', `bytes */${fileSize}`);
    res.status(416).send();
    return;
  }

  const end = Math.min(range.end, fileSize - 1);
  const chunk = fileBuffer.subarray(range.start, end + 1);
  res.setHeader('Content-Range', `bytes ${range.start}-${end}/${fileSize}`);
  res.setHeader('Content-Length', chunk.length.toString());
  res.status(206).send(chunk);
}

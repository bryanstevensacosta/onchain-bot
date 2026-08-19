/**
 * Best-effort MIME-type inference from a file extension. Telegram's
 * `sendPhoto` accepts JPEG/PNG/GIF/WebP; anything else falls back to
 * `application/octet-stream` which Telegram still accepts for most
 * common photo formats (it sniffs magic bytes server-side).
 */
export function guessMimeType(ext: string): string {
  const normalized = ext.toLowerCase();
  switch (normalized) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

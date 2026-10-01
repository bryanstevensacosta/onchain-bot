/**
 * Best-effort MIME-type inference from a file extension (moved
 * read-only from the backend `guess-mime-type`, Tramo 2 todo 7).
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
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

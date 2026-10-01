/**
 * Magic-byte media sniffing for scheduling uploads (local helper —
 * this app must not import another app's non-port helpers).
 *
 * Never trusts the client-supplied mimetype: images resolve from PNG /
 * JPEG / GIF / WebP signatures, video from MP4 (`ftyp`) / QuickTime
 * (`moov`/`mdat` at offset 4); anything else is
 * `application/octet-stream` and rejected by the upload use-cases.
 */
export function sniffSchedulingMimeType(buffer: Buffer): string {
  if (
    buffer.byteLength >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.byteLength >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.byteLength >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (
    buffer.byteLength >= 12 &&
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
  if (buffer.byteLength >= 8) {
    const box = buffer.subarray(4, 8).toString('ascii');
    if (box === 'ftyp' || box === 'moov' || box === 'mdat') {
      return 'video/mp4';
    }
  }
  return 'application/octet-stream';
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'video/mp4':
      return '.mp4';
    default:
      return '.bin';
  }
}

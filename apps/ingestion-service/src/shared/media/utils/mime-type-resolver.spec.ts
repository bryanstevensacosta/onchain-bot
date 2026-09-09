import { MimeTypeResolver } from './mime-type-resolver';

describe('MimeTypeResolver', () => {
  describe('getExtensionFromMimeType', () => {
    it('should return correct extension for common image types', () => {
      expect(MimeTypeResolver.getExtensionFromMimeType('image/jpeg')).toBe(
        '.jpg',
      );
      expect(MimeTypeResolver.getExtensionFromMimeType('image/png')).toBe(
        '.png',
      );
      expect(MimeTypeResolver.getExtensionFromMimeType('image/gif')).toBe(
        '.gif',
      );
      expect(MimeTypeResolver.getExtensionFromMimeType('image/webp')).toBe(
        '.webp',
      );
    });

    it('should return correct extension for video types', () => {
      expect(MimeTypeResolver.getExtensionFromMimeType('video/mp4')).toBe(
        '.mp4',
      );
      expect(MimeTypeResolver.getExtensionFromMimeType('video/mpeg')).toBe(
        '.mpeg',
      );
      expect(MimeTypeResolver.getExtensionFromMimeType('video/webm')).toBe(
        '.webm',
      );
    });

    it('should handle case-insensitive MIME types', () => {
      expect(MimeTypeResolver.getExtensionFromMimeType('IMAGE/JPEG')).toBe(
        '.jpg',
      );
      expect(MimeTypeResolver.getExtensionFromMimeType('Video/MP4')).toBe(
        '.mp4',
      );
    });

    it('should return .bin for unknown MIME types', () => {
      expect(MimeTypeResolver.getExtensionFromMimeType('unknown/type')).toBe(
        '.bin',
      );
      expect(
        MimeTypeResolver.getExtensionFromMimeType('application/x-custom'),
      ).toBe('.bin');
    });

    it('should return .bin for empty or null MIME types', () => {
      expect(MimeTypeResolver.getExtensionFromMimeType('')).toBe('.bin');
      expect(MimeTypeResolver.getExtensionFromMimeType(null as any)).toBe(
        '.bin',
      );
    });
  });

  describe('getMimeTypeFromExtension', () => {
    it('should return correct MIME type for common extensions', () => {
      // .jpg maps to image/jpg (last entry in map wins)
      expect(MimeTypeResolver.getMimeTypeFromExtension('.jpg')).toBe(
        'image/jpg',
      );
      expect(MimeTypeResolver.getMimeTypeFromExtension('.png')).toBe(
        'image/png',
      );
      expect(MimeTypeResolver.getMimeTypeFromExtension('.mp4')).toBe(
        'video/mp4',
      );
    });

    it('should handle extensions without leading dot', () => {
      expect(MimeTypeResolver.getMimeTypeFromExtension('jpg')).toBe(
        'image/jpg',
      );
      expect(MimeTypeResolver.getMimeTypeFromExtension('png')).toBe(
        'image/png',
      );
    });

    it('should handle case-insensitive extensions', () => {
      expect(MimeTypeResolver.getMimeTypeFromExtension('.JPG')).toBe(
        'image/jpg',
      );
      expect(MimeTypeResolver.getMimeTypeFromExtension('.PNG')).toBe(
        'image/png',
      );
    });

    it('should return octet-stream for unknown extensions', () => {
      expect(MimeTypeResolver.getMimeTypeFromExtension('.xyz')).toBe(
        'application/octet-stream',
      );
      expect(MimeTypeResolver.getMimeTypeFromExtension('.unknown')).toBe(
        'application/octet-stream',
      );
    });

    it('should return octet-stream for empty extension', () => {
      expect(MimeTypeResolver.getMimeTypeFromExtension('')).toBe(
        'application/octet-stream',
      );
    });
  });

  describe('getMimeTypeFromTelegramMedia', () => {
    it('should return image/jpeg for photo messages', () => {
      const photoMedia = { className: 'MessageMediaPhoto' };
      expect(MimeTypeResolver.getMimeTypeFromTelegramMedia(photoMedia)).toBe(
        'image/jpeg',
      );
    });

    it('should return document MIME type for documents', () => {
      const docMedia = {
        className: 'MessageMediaDocument',
        document: { mimeType: 'video/mp4' },
      };
      expect(MimeTypeResolver.getMimeTypeFromTelegramMedia(docMedia)).toBe(
        'video/mp4',
      );
    });

    it('should return null for documents without MIME type', () => {
      const docMedia = {
        className: 'MessageMediaDocument',
        document: {},
      };
      expect(
        MimeTypeResolver.getMimeTypeFromTelegramMedia(docMedia),
      ).toBeNull();
    });

    it('should return null for unknown media types', () => {
      const unknownMedia = { className: 'MessageMediaWebPage' };
      expect(
        MimeTypeResolver.getMimeTypeFromTelegramMedia(unknownMedia),
      ).toBeNull();
    });

    it('should return null for null/undefined media', () => {
      expect(MimeTypeResolver.getMimeTypeFromTelegramMedia(null)).toBeNull();
      expect(
        MimeTypeResolver.getMimeTypeFromTelegramMedia(undefined),
      ).toBeNull();
    });
  });

  describe('isVideo', () => {
    it('should return true for video MIME types', () => {
      expect(MimeTypeResolver.isVideo('video/mp4')).toBe(true);
      expect(MimeTypeResolver.isVideo('video/mpeg')).toBe(true);
      expect(MimeTypeResolver.isVideo('video/webm')).toBe(true);
    });

    it('should return false for non-video MIME types', () => {
      expect(MimeTypeResolver.isVideo('image/jpeg')).toBe(false);
      expect(MimeTypeResolver.isVideo('application/pdf')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(MimeTypeResolver.isVideo(null)).toBe(false);
      expect(MimeTypeResolver.isVideo(undefined as any)).toBe(false);
    });
  });

  describe('isImage', () => {
    it('should return true for image MIME types', () => {
      expect(MimeTypeResolver.isImage('image/jpeg')).toBe(true);
      expect(MimeTypeResolver.isImage('image/png')).toBe(true);
      expect(MimeTypeResolver.isImage('image/gif')).toBe(true);
    });

    it('should return false for non-image MIME types', () => {
      expect(MimeTypeResolver.isImage('video/mp4')).toBe(false);
      expect(MimeTypeResolver.isImage('application/pdf')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(MimeTypeResolver.isImage(null)).toBe(false);
      expect(MimeTypeResolver.isImage(undefined as any)).toBe(false);
    });
  });
});

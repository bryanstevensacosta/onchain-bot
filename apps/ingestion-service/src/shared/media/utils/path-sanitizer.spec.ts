import { PathSanitizer } from './path-sanitizer';

describe('PathSanitizer', () => {
  describe('sanitizeId', () => {
    it('should remove special characters except alphanumeric and hyphens', () => {
      // Hyphens are allowed in IDs
      expect(PathSanitizer.sanitizeId('-1001234567890')).toBe('-1001234567890');
      expect(PathSanitizer.sanitizeId('ad-123-test')).toBe('ad-123-test');
      // Underscores are NOT allowed in IDs (only alphanumeric + hyphens)
      expect(PathSanitizer.sanitizeId('channel_123')).toBe('channel123');
    });

    it('should prevent path traversal attacks', () => {
      expect(PathSanitizer.sanitizeId('../../../etc/passwd')).toBe('etcpasswd');
      expect(PathSanitizer.sanitizeId('../../backdoor')).toBe('backdoor');
      expect(PathSanitizer.sanitizeId('./current/path')).toBe('currentpath');
    });

    it('should remove slashes and dangerous characters', () => {
      expect(PathSanitizer.sanitizeId('folder/subfolder')).toBe('foldersubfolder');
      expect(PathSanitizer.sanitizeId('test\\windows\\path')).toBe('testwindowspath');
      // Spaces and semicolons removed, but hyphens preserved
      expect(PathSanitizer.sanitizeId('file;rm -rf /')).toBe('filerm-rf');
    });

    it('should throw for empty or null IDs', () => {
      expect(() => PathSanitizer.sanitizeId('')).toThrow('ID cannot be empty');
      expect(() => PathSanitizer.sanitizeId(null as any)).toThrow();
    });

    it('should throw for IDs with no valid characters', () => {
      expect(() => PathSanitizer.sanitizeId('!!!')).toThrow('contains no valid characters');
      expect(() => PathSanitizer.sanitizeId('###')).toThrow('contains no valid characters');
    });
  });

  describe('sanitizeFilename', () => {
    it('should preserve valid filenames', () => {
      expect(PathSanitizer.sanitizeFilename('photo.jpg')).toBe('photo.jpg');
      expect(PathSanitizer.sanitizeFilename('video_123.mp4')).toBe('video_123.mp4');
      expect(PathSanitizer.sanitizeFilename('document-final.pdf')).toBe('document-final.pdf');
    });

    it('should remove path separators', () => {
      // Dots are preserved in filenames (for extensions)
      expect(PathSanitizer.sanitizeFilename('../evil.sh')).toBe('..evil.sh');
      expect(PathSanitizer.sanitizeFilename('folder/file.txt')).toBe('folderfile.txt');
      // Windows paths get slashes removed, preserving rest
      expect(PathSanitizer.sanitizeFilename('c:\\windows\\system.dll')).toBe('cwindowssystem.dll');
    });

    it('should remove special characters except dot, hyphen, underscore', () => {
      expect(PathSanitizer.sanitizeFilename('my photo (1).png')).toBe('myphoto1.png');
      expect(PathSanitizer.sanitizeFilename('file@#$%.txt')).toBe('file.txt');
      expect(PathSanitizer.sanitizeFilename('test&file!.pdf')).toBe('testfile.pdf');
    });

    it('should preserve multiple dots (extensions)', () => {
      expect(PathSanitizer.sanitizeFilename('archive.tar.gz')).toBe('archive.tar.gz');
      expect(PathSanitizer.sanitizeFilename('backup.2024.01.01.sql')).toBe('backup.2024.01.01.sql');
    });

    it('should throw for empty filenames', () => {
      expect(() => PathSanitizer.sanitizeFilename('')).toThrow('Filename cannot be empty');
    });

    it('should throw for filenames with no valid characters', () => {
      expect(() => PathSanitizer.sanitizeFilename('###')).toThrow('contains no valid characters');
    });
  });

  describe('isSafePathComponent', () => {
    it('should accept safe alphanumeric components', () => {
      expect(PathSanitizer.isSafePathComponent('folder123')).toBe(true);
      expect(PathSanitizer.isSafePathComponent('test-dir')).toBe(true);
      expect(PathSanitizer.isSafePathComponent('my_folder')).toBe(true);
    });

    it('should reject path traversal patterns', () => {
      expect(PathSanitizer.isSafePathComponent('..')).toBe(false);
      expect(PathSanitizer.isSafePathComponent('../parent')).toBe(false);
      expect(PathSanitizer.isSafePathComponent('./current')).toBe(false);
    });

    it('should reject components with special characters', () => {
      expect(PathSanitizer.isSafePathComponent('folder/subfolder')).toBe(false);
      expect(PathSanitizer.isSafePathComponent('test;rm')).toBe(false);
      expect(PathSanitizer.isSafePathComponent('file space')).toBe(false);
    });

    it('should reject empty components', () => {
      expect(PathSanitizer.isSafePathComponent('')).toBe(false);
      expect(PathSanitizer.isSafePathComponent(null as any)).toBe(false);
    });
  });

  describe('buildSafePath', () => {
    it('should sanitize and return all components', () => {
      const parts = PathSanitizer.buildSafePath('uploads', 'channel-123', 'msg_1.jpg');
      expect(parts).toEqual(['uploads', 'channel-123', 'msg_1.jpg']);
    });

    it('should sanitize directory components as IDs', () => {
      const parts = PathSanitizer.buildSafePath('root', 'folder_with_underscore', 'sub');
      // Directory components (not last) are sanitized as IDs (remove underscores)
      expect(parts).toEqual(['root', 'folderwithunderscore', 'sub']);
    });

    it('should sanitize last component as filename (preserves underscores)', () => {
      const parts = PathSanitizer.buildSafePath('uploads', 'media', 'photo_1.jpg');
      expect(parts).toEqual(['uploads', 'media', 'photo_1.jpg']);
    });

    it('should throw for empty components', () => {
      expect(() => PathSanitizer.buildSafePath('uploads', '', 'file.txt')).toThrow(
        'Path component at index 1 is empty',
      );
    });

    it('should handle path traversal attempts in components', () => {
      const parts = PathSanitizer.buildSafePath('../uploads', '../../etc', 'passwd');
      expect(parts).toEqual(['uploads', 'etc', 'passwd']);
    });
  });

  describe('isWithinBase', () => {
    it('should accept paths within base directory', () => {
      expect(PathSanitizer.isWithinBase('/app/uploads', '/app/uploads/media/file.jpg')).toBe(true);
      expect(PathSanitizer.isWithinBase('/app/uploads/', '/app/uploads/media/file.jpg')).toBe(
        true,
      );
    });

    it('should reject paths outside base directory', () => {
      expect(PathSanitizer.isWithinBase('/app/uploads', '/etc/passwd')).toBe(false);
      expect(PathSanitizer.isWithinBase('/app/uploads', '/app/other/file.txt')).toBe(false);
    });

    it('should handle trailing slashes in base path', () => {
      expect(PathSanitizer.isWithinBase('/app/uploads', '/app/uploads/file.txt')).toBe(true);
      expect(PathSanitizer.isWithinBase('/app/uploads/', '/app/uploads/file.txt')).toBe(true);
    });

    it('should reject empty paths', () => {
      expect(PathSanitizer.isWithinBase('', '/some/path')).toBe(false);
      expect(PathSanitizer.isWithinBase('/base', '')).toBe(false);
      expect(PathSanitizer.isWithinBase(null as any, '/path')).toBe(false);
    });
  });
});

import { isRefreshableDownloadError } from './media-validation';

describe('media-validation utils', () => {
  describe('isRefreshableDownloadError()', () => {
    it('should return true for FILE_REFERENCE_EXPIRED', () => {
      const err = new Error('FILE_REFERENCE_EXPIRED');
      expect(isRefreshableDownloadError(err)).toBe(true);
    });

    it('should return true for FILEREF_UPGRADE_NEEDED', () => {
      const err = new Error('FILEREF_UPGRADE_NEEDED');
      expect(isRefreshableDownloadError(err)).toBe(true);
    });

    it('should return true for FILE_REFERENCE_INVALID', () => {
      const err = new Error('FILE_REFERENCE_INVALID');
      expect(isRefreshableDownloadError(err)).toBe(true);
    });

    it('should return true for "sizes" error', () => {
      const err = new Error('Photo has no valid sizes');
      expect(isRefreshableDownloadError(err)).toBe(true);
    });

    it('should return true for "no photo" error', () => {
      const err = new Error('There is no photo');
      expect(isRefreshableDownloadError(err)).toBe(true);
    });

    it('should return true for "No file" error', () => {
      const err = new Error('No file found');
      expect(isRefreshableDownloadError(err)).toBe(true);
    });

    it('should return false for non-refreshable errors', () => {
      const err = new Error('Network timeout');
      expect(isRefreshableDownloadError(err)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isRefreshableDownloadError(null)).toBe(false);
      expect(isRefreshableDownloadError(undefined)).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isRefreshableDownloadError('string error')).toBe(false);
      expect(isRefreshableDownloadError(123)).toBe(false);
    });
  });
});

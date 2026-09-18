/**
 * Media validation utilities
 * 
 * Helpers for detecting and handling media download errors from Telegram.
 */

/**
 * Check if error is a refreshable download error
 * 
 * Some Telegram download errors are transient and can be retried:
 * - FILE_REFERENCE_EXPIRED: file reference expired (get fresh one)
 * - FILEREF_UPGRADE_NEEDED: protocol upgrade required
 * - FILE_REFERENCE_INVALID: reference is invalid
 * 
 * Other errors indicate missing or invalid media:
 * - "sizes": photo has no valid sizes
 * - "no photo": photo not found
 * - "No file": file not found
 * 
 * @param err - Error object from download attempt
 * @returns true if error is refreshable/transient
 */
export function isRefreshableDownloadError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  return (
    msg.includes('FILE_REFERENCE_EXPIRED') ||
    msg.includes('FILEREF_UPGRADE_NEEDED') ||
    msg.includes('FILE_REFERENCE_INVALID') ||
    msg.includes('sizes') ||
    msg.includes('no photo') ||
    msg.includes('No file')
  );
}

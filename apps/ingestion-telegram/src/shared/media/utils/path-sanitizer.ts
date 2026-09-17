/**
 * Static utility for path sanitization and validation.
 *
 * Prevents path traversal attacks and ensures consistent
 * path building across media components.
 *
 * Previously duplicated in:
 * - MediaDownloaderService (ingestion-service)
 * - MtprotoMediaDownloader (backend)
 * - LocalAdMediaStorageAdapter (backend)
 * - MediaController (ingestion-service)
 * - AdsMediaController (backend)
 */
export class PathSanitizer {
  /**
   * Regex pattern for safe path components.
   * Allows: alphanumeric, hyphens, underscores.
   * Blocks: path traversal (../, ./), special chars, spaces.
   */
  private static readonly SAFE_PATH_COMPONENT = /^[a-zA-Z0-9_-]+$/;

  /**
   * Regex pattern for sanitizing ID strings (channelId, adId, etc).
   * Removes everything except alphanumeric and hyphens.
   */
  private static readonly ID_SANITIZE_PATTERN = /[^a-zA-Z0-9-]/g;

  /**
   * Sanitize a channel/ad/entity ID for use in file paths.
   *
   * Removes all characters except alphanumeric and hyphens.
   * Prevents path traversal attacks.
   *
   * @param id - Raw ID string (may contain Telegram prefixes, special chars)
   * @returns Sanitized ID safe for file paths
   *
   * @example
   * ```ts
   * PathSanitizer.sanitizeId('-1001234567890'); // '1001234567890'
   * PathSanitizer.sanitizeId('ad-123-test'); // 'ad-123-test'
   * PathSanitizer.sanitizeId('../../../etc/passwd'); // 'etcpasswd'
   * ```
   */
  public static sanitizeId(id: string): string {
    if (!id) {
      throw new Error('ID cannot be empty');
    }

    const sanitized = id.replace(this.ID_SANITIZE_PATTERN, '');

    if (!sanitized) {
      throw new Error(`Invalid ID: "${id}" contains no valid characters`);
    }

    return sanitized;
  }

  /**
   * Sanitize a filename for safe storage.
   *
   * Removes path separators and special characters.
   * Preserves the extension if present.
   *
   * @param filename - Original filename
   * @returns Sanitized filename safe for storage
   *
   * @example
   * ```ts
   * PathSanitizer.sanitizeFilename('photo.jpg'); // 'photo.jpg'
   * PathSanitizer.sanitizeFilename('../evil.sh'); // 'evil.sh'
   * PathSanitizer.sanitizeFilename('my photo (1).png'); // 'myphoto1.png'
   * ```
   */
  public static sanitizeFilename(filename: string): string {
    if (!filename) {
      throw new Error('Filename cannot be empty');
    }

    // Remove path separators
    let sanitized = filename.replace(/[/\\]/g, '');

    // Remove special characters except dot and hyphen
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');

    if (!sanitized) {
      throw new Error(
        `Invalid filename: "${filename}" contains no valid characters`,
      );
    }

    return sanitized;
  }

  /**
   * Validate that a path component is safe (no path traversal).
   *
   * @param component - Path component to validate
   * @returns true if safe, false if contains dangerous patterns
   *
   * @example
   * ```ts
   * PathSanitizer.isSafePathComponent('folder123'); // true
   * PathSanitizer.isSafePathComponent('..'); // false
   * PathSanitizer.isSafePathComponent('./current'); // false
   * ```
   */
  public static isSafePathComponent(component: string): boolean {
    if (!component) {
      return false;
    }

    // Reject path traversal patterns
    if (component.includes('..') || component.includes('./')) {
      return false;
    }

    // Check against safe pattern
    return this.SAFE_PATH_COMPONENT.test(component);
  }

  /**
   * Build a safe file path by joining sanitized components.
   *
   * Each component is validated and sanitized before joining.
   * Use Node's `path.join` for the final assembly.
   *
   * @param components - Path components to join
   * @returns Array of sanitized components ready for path.join()
   *
   * @example
   * ```ts
   * const parts = PathSanitizer.buildSafePath('uploads', 'channel-123', 'msg_1.jpg');
   * const fullPath = path.join(...parts); // 'uploads/channel-123/msg_1.jpg'
   * ```
   */
  public static buildSafePath(...components: string[]): string[] {
    return components.map((component, index) => {
      if (!component) {
        throw new Error(`Path component at index ${index} is empty`);
      }

      // Last component is typically a filename, sanitize differently
      if (index === components.length - 1 && component.includes('.')) {
        return this.sanitizeFilename(component);
      }

      return this.sanitizeId(component);
    });
  }

  /**
   * Validate that a full path does not escape a base directory.
   *
   * Ensures the resolved path is still within the base directory.
   * Use after path.resolve() to validate the final path.
   *
   * @param basePath - Base directory (must be absolute)
   * @param fullPath - Full resolved path to validate
   * @returns true if path is within base directory
   *
   * @example
   * ```ts
   * const base = '/app/uploads';
   * PathSanitizer.isWithinBase(base, '/app/uploads/media/file.jpg'); // true
   * PathSanitizer.isWithinBase(base, '/etc/passwd'); // false
   * ```
   */
  public static isWithinBase(basePath: string, fullPath: string): boolean {
    if (!basePath || !fullPath) {
      return false;
    }

    // Normalize paths for comparison (resolve symlinks, etc)
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

    return fullPath.startsWith(normalizedBase);
  }
}

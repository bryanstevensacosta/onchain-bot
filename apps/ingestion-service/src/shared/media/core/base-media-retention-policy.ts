import type { CleanupResult } from '../types/media-metadata';
import { BaseFileSystemAdapter } from './base-file-system-adapter';

/**
 * Abstract base class for media retention and cleanup policies.
 *
 * Provides common logic for:
 * - Age-based file deletion
 * - Directory traversal
 * - Error collection
 * - Cleanup reporting
 *
 * **Cohesion Goal**: Centralize cleanup logic from:
 * - MediaCleanupService (backend)
 * - MediaRetentionCleanupScheduler (backend)
 *
 * Subclasses define the retention criteria (age, count, size, etc.).
 *
 * @example
 * ```ts
 * class TimeBasedRetentionPolicy extends BaseMediaRetentionPolicy {
 *   constructor(
 *     fileSystem: BaseFileSystemAdapter,
 *     private readonly retentionMs: number,
 *   ) {
 *     super(fileSystem);
 *   }
 *
 *   protected async shouldDelete(filePath: string): Promise<boolean> {
 *     const stat = await this.fileSystem.stat(filePath);
 *     const age = Date.now() - stat.mtime.getTime();
 *     return age > this.retentionMs;
 *   }
 * }
 * ```
 */
export abstract class BaseMediaRetentionPolicy {
  constructor(protected readonly fileSystem: BaseFileSystemAdapter) {}

  /**
   * Execute cleanup on a directory based on retention policy.
   *
   * Recursively processes all files, evaluates retention policy,
   * and deletes files that should be removed.
   *
   * @param directory - Root directory to clean up
   * @param recursive - Whether to recurse into subdirectories (default: false)
   * @returns Cleanup result (deleted count, errors)
   */
  public async cleanup(
    directory: string,
    recursive = false,
  ): Promise<CleanupResult> {
    const result: { deleted: number; errors: string[] } = {
      deleted: 0,
      errors: [],
    };

    try {
      await this.cleanupDirectory(directory, recursive, result);
    } catch (error: any) {
      result.errors.push(`Failed to cleanup ${directory}: ${error.message}`);
    }

    return result;
  }

  /**
   * Clean up files in a single directory.
   *
   * @param directory - Directory to process
   * @param recursive - Whether to recurse into subdirectories
   * @param result - Accumulated cleanup result
   */
  protected async cleanupDirectory(
    directory: string,
    recursive: boolean,
    result: { deleted: number; errors: string[] },
  ): Promise<void> {
    // Get all files in directory
    const files = await this.fileSystem.listFiles(directory);

    // Process each file
    for (const filePath of files) {
      try {
        const shouldDelete = await this.shouldDelete(filePath);

        if (shouldDelete) {
          await this.fileSystem.delete(filePath);
          result.deleted++;
        }
      } catch (error: any) {
        result.errors.push(`${filePath}: ${error.message}`);
      }
    }

    // Recurse into subdirectories if requested
    if (recursive) {
      // TODO: Implement subdirectory recursion
      // This requires readdir with withFileTypes and filtering for directories
    }
  }

  /**
   * Determine if a file should be deleted based on retention policy.
   *
   * Subclasses implement this to define their specific criteria:
   * - Age-based: file older than N days
   * - Count-based: keep only last N files
   * - Size-based: delete if directory exceeds size limit
   *
   * @param filePath - Absolute path to the file
   * @returns true if file should be deleted
   */
  protected abstract shouldDelete(filePath: string): Promise<boolean>;

  /**
   * Calculate the age of a file in milliseconds.
   *
   * Helper for age-based retention policies.
   *
   * @param filePath - Path to the file
   * @returns Age in milliseconds
   */
  protected async getFileAge(filePath: string): Promise<number> {
    const stat = await this.fileSystem.stat(filePath);
    return Date.now() - stat.mtime.getTime();
  }

  /**
   * Convert hours to milliseconds.
   *
   * Helper for configuring retention periods.
   *
   * @param hours - Number of hours
   * @returns Milliseconds
   */
  protected hoursToMs(hours: number): number {
    return hours * 60 * 60 * 1000;
  }

  /**
   * Convert days to milliseconds.
   *
   * @param days - Number of days
   * @returns Milliseconds
   */
  protected daysToMs(days: number): number {
    return days * 24 * 60 * 60 * 1000;
  }
}

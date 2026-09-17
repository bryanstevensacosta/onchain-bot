import { createReadStream, type ReadStream } from 'node:fs';
import {
  readFile,
  writeFile,
  stat,
  unlink,
  mkdir,
  readdir,
} from 'node:fs/promises';
import type { Stats } from 'node:fs';
import * as path from 'node:path';

/**
 * Abstract base class for file system operations on media files.
 *
 * Provides common I/O operations (read, write, stream, delete)
 * with consistent error handling and logging patterns.
 *
 * **Cohesion Goal**: Eliminate duplicated file I/O logic across:
 * - MediaDownloaderService (ingestion-service)
 * - LocalAdMediaStorageAdapter (backend)
 * - MediaController (ingestion-service)
 * - AdsMediaController (backend)
 *
 * Subclasses can override methods to add logging, metrics, or custom behavior.
 *
 * @example
 * ```ts
 * class LocalMediaStorage extends BaseFileSystemAdapter {
 *   async write(filePath: string, buffer: Buffer): Promise<void> {
 *     this.logger.log(`Writing ${buffer.length} bytes to ${filePath}`);
 *     await super.write(filePath, buffer);
 *   }
 * }
 * ```
 */
export abstract class BaseFileSystemAdapter {
  /**
   * Write a buffer to disk at the specified path.
   *
   * Creates parent directories if they don't exist.
   * Overwrites existing file.
   *
   * @param filePath - Absolute path where to write the file
   * @param buffer - File content as Buffer
   * @throws Error if write fails (permission, disk space, etc.)
   */
  public async write(filePath: string, buffer: Buffer): Promise<void> {
    await this.ensureDirectoryExists(path.dirname(filePath));
    await writeFile(filePath, buffer);
  }

  /**
   * Read a file from disk into a Buffer.
   *
   * @param filePath - Absolute path to the file
   * @returns File content as Buffer
   * @throws Error if file doesn't exist or read fails
   */
  public async read(filePath: string): Promise<Buffer> {
    return await readFile(filePath);
  }

  /**
   * Create a readable stream for a file.
   *
   * Useful for HTTP responses and large file operations.
   * Caller is responsible for handling stream events and cleanup.
   *
   * @param filePath - Absolute path to the file
   * @returns ReadStream for the file
   */
  public stream(filePath: string): ReadStream {
    return createReadStream(filePath);
  }

  /**
   * Get file statistics (size, mtime, etc.).
   *
   * @param filePath - Absolute path to the file
   * @returns File stats object
   * @throws Error if file doesn't exist
   */
  public async stat(filePath: string): Promise<Stats> {
    return await stat(filePath);
  }

  /**
   * Check if a file exists.
   *
   * @param filePath - Absolute path to the file
   * @returns true if file exists and is accessible
   */
  public async exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file from disk.
   *
   * Does not throw if file doesn't exist (idempotent).
   *
   * @param filePath - Absolute path to the file
   */
  public async delete(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error: any) {
      // Ignore if file doesn't exist (already deleted)
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Find files in a directory matching a pattern.
   *
   * Returns full absolute paths, not just filenames.
   * Does not recurse into subdirectories.
   *
   * @param directory - Absolute path to search
   * @param pattern - Regex pattern to match filenames
   * @returns Array of absolute paths to matching files
   *
   * @example
   * ```ts
   * // Find all message_*.jpg files
   * const files = await adapter.findByPattern(
   *   '/uploads/crypto-news/media/channel123',
   *   /^message_\d+\.jpg$/
   * );
   * ```
   */
  public async findByPattern(
    directory: string,
    pattern: RegExp,
  ): Promise<string[]> {
    try {
      const entries = await readdir(directory);
      const matches = entries.filter((name) => pattern.test(name));
      return matches.map((name) => path.join(directory, name));
    } catch (error: any) {
      // Return empty array if directory doesn't exist
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * List all files in a directory.
   *
   * Returns absolute paths. Does not recurse.
   *
   * @param directory - Absolute path to list
   * @returns Array of absolute paths to files
   */
  public async listFiles(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(directory, entry.name));
      return files;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Ensure a directory exists, creating it recursively if needed.
   *
   * Idempotent: does not fail if directory already exists.
   *
   * @param directory - Absolute path to create
   */
  protected async ensureDirectoryExists(directory: string): Promise<void> {
    await mkdir(directory, { recursive: true });
  }

  /**
   * Get file extension from a path.
   *
   * Returns extension with leading dot (e.g., '.jpg').
   * Returns empty string if no extension.
   *
   * @param filePath - File path or name
   * @returns Extension with dot, or empty string
   */
  protected getExtension(filePath: string): string {
    return path.extname(filePath);
  }

  /**
   * Get filename without extension.
   *
   * @param filePath - File path or name
   * @returns Filename without extension
   */
  protected getBasename(filePath: string): string {
    return path.basename(filePath, this.getExtension(filePath));
  }
}

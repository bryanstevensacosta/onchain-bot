import { existsSync, readFileSync, statSync } from 'node:fs';
import type { Logger } from '@nestjs/common';

export interface FileReadResult {
  bytes: Buffer;
  error?: string;
}

/**
 * Read a single file from disk with validation. Inlines the exact
 * statSync → isFile → readFileSync pattern used by sendPhoto/sendVideo.
 *
 * Returns { bytes, error? } — callers check `error` and propagate.
 */
export function readFileWithValidation(
  filePath: string,
  logger: Logger,
  label: string,
): FileReadResult {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return { bytes: Buffer.alloc(0), error: `not a file: ${filePath}` };
    }
    const bytes = readFileSync(filePath);
    return { bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error(`failed to read ${label} at ${filePath}: ${message}`);
    return { bytes: Buffer.alloc(0), error: message };
  }
}

/**
 * Read multiple files from disk. Returns all on success or the first
 * error. Mirrors the exact error-handling from sendMediaGroup.
 */
export function readMultipleFilesWithValidation(
  filePaths: string[],
  logger: Logger,
  label: string,
): { bytesArray: Buffer[]; error?: string } {
  const bytesArray: Buffer[] = [];
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      return { bytesArray: [], error: `file not found: ${filePath}` };
    }
    try {
      const stats = statSync(filePath);
      if (!stats.isFile()) {
        return {
          bytesArray: [],
          error: `not a file: ${filePath}`,
        };
      }
      bytesArray.push(readFileSync(filePath));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(`failed to read ${label} at ${filePath}: ${message}`);
      return { bytesArray: [], error: message };
    }
  }
  return { bytesArray };
}

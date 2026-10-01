import { existsSync, readFileSync, statSync } from 'node:fs';
import type { Logger } from '@nestjs/common';

export interface FileReadResult {
  readonly bytes: Buffer;
  readonly error?: string;
}

/**
 * Local file reads with validation (moved read-only from the backend
 * `telegram-file-utils`, Tramo 2 todo 7). Callers check `error` and
 * propagate — a missing photo never posts a text-only fallback
 * silently; the drain retries and the failure is visible.
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
    return { bytes: readFileSync(filePath) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error(`failed to read ${label} at ${filePath}: ${message}`);
    return { bytes: Buffer.alloc(0), error: message };
  }
}

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
    const single = readFileWithValidation(filePath, logger, label);
    if (single.error) {
      return { bytesArray: [], error: single.error };
    }
    bytesArray.push(single.bytes);
  }
  return { bytesArray };
}

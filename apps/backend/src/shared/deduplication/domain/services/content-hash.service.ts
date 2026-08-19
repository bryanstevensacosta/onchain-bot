/**
 * Pure domain service for hashing content.
 *
 * NO NestJS decorators, NO TypeORM, NO IO.
 */

import { createHash } from 'crypto';
import { ContentNormalizerService } from './content-normalizer.service';

/**
 * Pure domain service for creating content hashes.
 */
export class ContentHashService {
  /**
   * Creates a SHA256 hash of the normalized content.
   *
   * @param content - Raw content to hash
   * @returns SHA256 hex string
   */
  public static hash(content: string): string {
    const normalized = ContentNormalizerService.normalize(content);
    return createHash('sha256').update(normalized).digest('hex');
  }
}

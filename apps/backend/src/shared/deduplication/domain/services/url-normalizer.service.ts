/**
 * Pure domain service for normalizing URLs.
 *
 * NO NestJS decorators, NO TypeORM, NO IO.
 */

import { createHash } from 'crypto';

/**
 * Query parameters to remove during normalization.
 */
const PARAMS_TO_REMOVE = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'source',
  'campaign',
]);

/**
 * Pure domain service for URL normalization and hashing.
 */
export class UrlNormalizerService {
  /**
   * Extracts all URLs from content.
   *
   * @param content - Content to extract URLs from
   * @returns Array of URLs found
   */
  public static extractUrls(content: string): string[] {
    const regex = /https?:\/\/\S+/g;
    const urls: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      urls.push(match[0]);
    }

    return urls;
  }

  /**
   * Normalizes a URL by removing tracking parameters.
   *
   * Removes: utm_*, fbclid, gclid, ref, source, campaign
   *
   * @param url - URL to normalize
   * @returns Normalized URL
   */
  public static normalize(url: string): string {
    try {
      const urlObj = new URL(url);

      // Remove tracking parameters
      const paramsToDelete: string[] = [];
      urlObj.searchParams.forEach((_, key) => {
        if (PARAMS_TO_REMOVE.has(key.toLowerCase())) {
          paramsToDelete.push(key);
        }
      });

      paramsToDelete.forEach((param) => urlObj.searchParams.delete(param));

      // Return without trailing slash for consistency
      let result = urlObj.toString();
      if (result.endsWith('/')) {
        result = result.slice(0, -1);
      }

      return result;
    } catch {
      // If URL parsing fails, return original
      return url;
    }
  }

  /**
   * Normalizes all URLs.
   *
   * @param urls - Array of URLs to normalize
   * @returns Array of normalized URLs
   */
  public static normalizeAll(urls: string[]): string[] {
    return urls.map((url) => this.normalize(url));
  }

  /**
   * Creates a SHA256 hash of a normalized URL.
   *
   * @param url - URL to hash
   * @returns SHA256 hex string
   */
  public static hash(url: string): string {
    const normalized = this.normalize(url);
    return createHash('sha256').update(normalized).digest('hex');
  }
}

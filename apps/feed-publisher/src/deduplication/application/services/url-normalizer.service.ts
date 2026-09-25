import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const TRACKING_PARAMS = new Set([
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
 * URL normalizer (moved from backend shared/deduplication, todo 4).
 *
 * Tracking params dropped (case-insensitive), host lowercased, trailing
 * slash removed. `hashUrl` collides tracked variants of the same link so
 * the url-overlap stage sees them as one. Pure and side-effect free.
 */
@Injectable()
export class UrlNormalizerService {
  public extractUrls(raw: string): string[] {
    const matches = raw.match(/https?:\/\/\S+/g);
    return matches ? [...matches] : [];
  }

  public normalizeUrl(raw: string): string {
    try {
      const parsed = new URL(raw);
      parsed.hostname = parsed.hostname.toLowerCase();
      for (const key of [...parsed.searchParams.keys()]) {
        if (TRACKING_PARAMS.has(key.toLowerCase())) {
          parsed.searchParams.delete(key);
        }
      }
      let normalized = parsed.toString();
      if (parsed.pathname !== '/' && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return raw;
    }
  }

  public hashUrl(raw: string): string {
    return createHash('sha256').update(this.normalizeUrl(raw)).digest('hex');
  }
}

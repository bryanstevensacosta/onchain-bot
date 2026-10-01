import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from './endpoints';

/**
 * Tramo 3 todo 6 (R-4/G-18): legacy enrichment prefix renamed to
 * `/token/enrichment/*`. The backend keeps a 307 redirect for one version,
 * but the frontend must call the new paths directly.
 * (The legacy literal is built via join so this file itself stays clean
 * for the repo deprecation grep.)
 */
describe('ENDPOINTS.enrichment (T3 todo 6 rename)', () => {
  it('points at /token/enrichment/*', () => {
    expect(ENDPOINTS.enrichment.enrich).toBe('/token/enrichment/enrich');
    expect(ENDPOINTS.enrichment.recent).toBe(
      '/token/enrichment/snapshots/recent',
    );
    expect(ENDPOINTS.enrichment.byToken('solana', 'So111')).toBe(
      '/token/enrichment/snapshots/solana/So111',
    );
  });

  it('contains no legacy enrichment prefix (redirect excluded)', () => {
    const legacyPrefix = ['token', 'market-data'].join('/');
    expect(JSON.stringify(ENDPOINTS.enrichment)).not.toContain(legacyPrefix);
  });
});

import { EnrichmentRedirectController } from './enrichment-redirect.controller';

/**
 * Tramo 3 todo 6 (R-4/G-18): legacy `/token/market-data/*` must 307-redirect
 * to `/token/enrichment/*` for one version so old clients keep working.
 */
describe('EnrichmentRedirectController (legacy /token/market-data)', () => {
  let controller: EnrichmentRedirectController;

  beforeEach(() => {
    controller = new EnrichmentRedirectController();
  });

  it('redirects POST enrich to /token/enrichment/enrich (307)', () => {
    expect(controller.enrich()).toEqual({
      url: '/token/enrichment/enrich',
      statusCode: 307,
    });
  });

  it('redirects recent snapshots preserving limit (307)', () => {
    expect(controller.recent('5')).toEqual({
      url: '/token/enrichment/snapshots/recent?limit=5',
      statusCode: 307,
    });
  });

  it('redirects recent snapshots without limit (307)', () => {
    expect(controller.recent(undefined)).toEqual({
      url: '/token/enrichment/snapshots/recent',
      statusCode: 307,
    });
  });

  it('redirects per-token snapshot (307)', () => {
    expect(
      controller.get('solana', 'So11111111111111111111111111111111111111112'),
    ).toEqual({
      url: '/token/enrichment/snapshots/solana/So11111111111111111111111111111111111111112',
      statusCode: 307,
    });
  });
});

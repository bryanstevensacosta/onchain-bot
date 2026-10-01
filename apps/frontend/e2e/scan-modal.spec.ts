import { expect, test, type Page, type Route } from '@playwright/test';

const ADDRESS = 'So11111111111111111111111111111111111111112';
const QUERY = `/x solana ${ADDRESS}`;

function snapshot(chain: string, address: string, kind = 'token') {
  return {
    chain,
    address,
    kind,
    key: `${chain}:${address}`.toLowerCase(),
    status: 'pending',
    providers: ['dexscreener'],
  };
}

function compat(chain: string, address: string) {
  return {
    priceUsd: 1.23,
    liquidityUsd: 456789,
    volume24hUsd: 98765,
    marketCapUsd: 2500000,
    fdvUsd: 5000000,
    priceChange24h: 4.5,
    holders: 1234,
    top10HolderPercent: 12.5,
    symbol: 'BONK',
    name: 'Bonk',
    lockedLiquidityPercent: null,
    burnedPercent: null,
    ...snapshot(chain, address),
  };
}

async function mockMarketData(page: Page) {
  await page.route('**/market-data-api/**', (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/market-data-api/, '');
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const addressMatch = path.match(/^\/api\/v1\/addresses\/([^/]+)\/([^/]+)$/);
    if (addressMatch && method === 'GET') {
      const [, chain, address] = addressMatch;
      return json(snapshot(chain, address, 'token'));
    }
    if (path === '/api/market-data/snapshot' && method === 'GET') {
      const chain = url.searchParams.get('chain') ?? 'solana';
      const address = url.searchParams.get('address') ?? ADDRESS;
      return json(compat(chain, address));
    }
    return json({ message: 'not mocked' }, 404);
  });
  await page.route('**/dexter-api/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

test.describe('scanner search modal', () => {
  test('open, search, reopen shows recent', async ({ page }) => {
    await mockMarketData(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-open-modal')).toBeVisible();
    await expect(page.getByTestId('scan-modal-panel')).toHaveCount(0);

    await page.getByTestId('dexter-open-modal').click();
    await expect(page.getByTestId('scan-modal-panel')).toBeVisible();
    await expect(page.getByTestId('scan-modal-recent-empty')).toBeVisible();

    await page.getByTestId('scan-modal-input').fill(QUERY);
    await page.getByTestId('scan-modal-submit').click();
    await expect(page.getByTestId('dexter-x')).toBeVisible();
    await expect(page.getByTestId('dexter-scan-result')).toBeVisible();
    await expect(page.getByTestId('scan-modal-recent-item')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('scan-modal-panel')).toHaveCount(0);

    await page.getByTestId('dexter-open-modal').click();
    await expect(page.getByTestId('scan-modal-panel')).toBeVisible();
    await expect(page.getByTestId('scan-modal-recent-item')).toHaveCount(1);
    await expect(
      page.getByTestId('scan-modal-recent-item').first(),
    ).toContainText(QUERY);
  });
});

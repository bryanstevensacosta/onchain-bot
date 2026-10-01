import { expect, test, type Page, type Route } from '@playwright/test';

const CHAINS = [
  {
    id: 'solana',
    family: 'SOLANA',
    displayName: 'Solana',
    nativeSymbol: 'SOL',
    explorerUrl: 'https://solscan.io',
    geckoTerminalSlug: 'solana',
  },
  {
    id: 'ethereum',
    family: 'EVM',
    displayName: 'Ethereum',
    nativeSymbol: 'ETH',
    explorerUrl: 'https://etherscan.io',
    geckoTerminalSlug: 'eth',
  },
];

const PROVIDERS = [
  {
    name: 'dexscreener',
    kind: 'market',
    status: 'up',
    latencyMs: 42,
    errorCount: 0,
    lastCheckAt: null,
  },
  {
    name: 'rugcheck',
    kind: 'security',
    status: 'degraded',
    latencyMs: 180,
    errorCount: 2,
    lastCheckAt: null,
  },
];

const ADDRESS = 'So11111111111111111111111111111111111111112';

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

function compat(chain: string, address: string, kind = 'token') {
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
    ...snapshot(chain, address, kind),
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

    if (path === '/api/v1/chains' && method === 'GET') {
      return json(CHAINS);
    }
    if (path === '/api/v1/chains/detect' && method === 'GET') {
      return json({ chain: 'solana', family: 'SOLANA' });
    }
    if (path === '/api/v1/providers' && method === 'GET') {
      return json(PROVIDERS);
    }
    const addressMatch = path.match(/^\/api\/v1\/addresses\/([^/]+)\/([^/]+)$/);
    if (addressMatch && method === 'GET') {
      const [, chain, address] = addressMatch;
      const kind = url.searchParams.get('kind') ?? 'unknown';
      return json(snapshot(chain, address, kind));
    }
    if (path === '/api/market-data/snapshot' && method === 'GET') {
      const chain = url.searchParams.get('chain') ?? 'solana';
      const address = url.searchParams.get('address') ?? ADDRESS;
      return json(compat(chain, address));
    }
    if (path === '/api/v1/addresses/batch' && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        items: Array<{ chain: string; address: string; kind?: string }>;
      };
      return json({
        snapshots: body.items.map((item) =>
          item.address === 'bad'
            ? { chain: item.chain, address: item.address, error: 'not found' }
            : snapshot(item.chain, item.address, item.kind ?? 'token'),
        ),
      });
    }
    return json({ message: 'not mocked' }, 404);
  });
}

test.describe('market-data dashboard (Tramo 3, todo 7)', () => {
  test('chains + providers render with polling', async ({ page }) => {
    await mockMarketData(page);
    await page.goto('/market-data');
    await expect(page.getByTestId('market-chains')).toBeVisible();
    await expect(page.getByTestId('chain-solana')).toBeVisible();
    await expect(page.getByTestId('market-providers')).toBeVisible();
    await expect(page.getByTestId('provider-dexscreener')).toBeVisible();
    await expect(page.getByTestId('provider-rugcheck')).toBeVisible();
  });

  test('detect-chain + address lookup show kind display', async ({ page }) => {
    await mockMarketData(page);
    await page.goto('/market-data');
    await page.getByTestId('detect-input').fill(ADDRESS);
    await page.getByTestId('detect-submit').click();
    await expect(page.getByTestId('detect-result')).toContainText('solana');

    await page.getByTestId('lookup-chain').fill('solana');
    await page.getByTestId('lookup-address').fill(ADDRESS);
    await page.getByTestId('lookup-kind').fill('token');
    await page.getByTestId('lookup-submit').click();
    await expect(page.getByTestId('lookup-result')).toBeVisible();
    await expect(page.getByTestId('lookup-kind-badge')).toContainText('token');
  });

  test('compat snapshot + batch lookup render', async ({ page }) => {
    await mockMarketData(page);
    await page.goto('/market-data');
    await page.getByTestId('compat-chain').fill('solana');
    await page.getByTestId('compat-address').fill(ADDRESS);
    await page.getByTestId('compat-submit').click();
    await expect(page.getByTestId('compat-result')).toBeVisible();
    await expect(page.getByTestId('compat-kind-badge')).toContainText('token');

    await page
      .getByTestId('batch-input')
      .fill(`solana ${ADDRESS} token\nsolana bad token`);
    await page.getByTestId('batch-submit').click();
    await expect(page.getByTestId('batch-result')).toBeVisible();
    await expect(page.getByTestId('batch-row-0')).toContainText('token');
    await expect(page.getByTestId('batch-row-1')).toContainText('not found');
  });

  test('API down renders empty states, never crashes', async ({ page }) => {
    await page.route('**/market-data-api/**', (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'down' }),
      }),
    );
    await page.goto('/market-data');
    await expect(page.getByTestId('market-chains-empty')).toBeVisible();
    await expect(page.getByTestId('market-providers-empty')).toBeVisible();
  });
});

test.describe('dexter lookup (Tramo 3, todo 7)', () => {
  test('/x renders the full-scan card via market-data HTTP', async ({
    page,
  }) => {
    await mockMarketData(page);
    await page.goto('/dexter');
    await page.getByTestId('dexter-input').fill(`/x solana ${ADDRESS}`);
    await page.getByTestId('dexter-submit').click();
    await expect(page.getByTestId('dexter-x')).toBeVisible();
    await expect(page.getByTestId('dexter-scan-result')).toBeVisible();
    await expect(page.getByTestId('dexter-kind-badge')).toContainText('token');
  });

  test('/c renders chart links via market-data HTTP', async ({ page }) => {
    await mockMarketData(page);
    await page.goto('/dexter');
    await page.getByTestId('dexter-input').fill('/c ethereum 0xabc');
    await page.getByTestId('dexter-submit').click();
    await expect(page.getByTestId('dexter-c')).toBeVisible();
    await expect(page.getByTestId('dexter-chart-result')).toBeVisible();
    const href = await page
      .getByTestId('dexter-dexscreener-link')
      .getAttribute('href');
    expect(href).toContain('dexscreener.com/ethereum/0xabc');
  });

  test('API down renders empty states, never crashes', async ({ page }) => {
    await page.route('**/market-data-api/**', (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'down' }),
      }),
    );
    await page.goto('/dexter');
    await page.getByTestId('dexter-input').fill(`/x solana ${ADDRESS}`);
    await page.getByTestId('dexter-submit').click();
    await expect(page.getByTestId('dexter-scan-empty')).toBeVisible();
  });
});

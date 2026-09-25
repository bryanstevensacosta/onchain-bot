import { expect, test, type Page, type Route } from '@playwright/test';

const TEMPLATES = [
  {
    id: 'vip-calls',
    name: 'vip-calls',
    active: true,
    kolSourceIds: [],
    minVisibleScore: 50,
    gemMinScore: 70,
    gemPatterns: ['pump\\.fun'],
    rankingStrategy: 'score',
    rankingLimit: 50,
    botId: null,
    channelTarget: null,
    adminVerifiedAt: null,
    canPublish: false,
  },
];

const SOURCES = [
  { channelId: 'ch-alpha', handle: '@alpha', title: 'Alpha', avatarUrl: null, url: 'https://t.me/alpha' },
  { channelId: 'ch-beta', handle: '@beta', title: 'Beta', avatarUrl: null, url: 'https://t.me/beta' },
  { channelId: 'ch-gamma', handle: '@gamma', title: 'Gamma', avatarUrl: null, url: 'https://t.me/gamma' },
];

const RANKED = [
  {
    mentionId: 'ch-alpha:100:0',
    kolId: 'ch-alpha',
    score: 82,
    rankScore: 82,
    rank: 1,
    strategy: 'score',
    scoredAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    ticker: 'BONK',
    chain: 'solana',
    address: 'Addr1111111111111111111111111111111111111111',
    mcAt: 2_500_000,
    timesCalled: 1,
    tracking: 'First time',
    breakdown: [],
  },
  {
    mentionId: 'ch-beta:200:0',
    kolId: 'ch-beta',
    score: 74,
    rankScore: 74,
    rank: 2,
    strategy: 'score',
    scoredAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    ticker: 'WIF',
    chain: 'solana',
    address: 'Addr2222222222222222222222222222222222222222',
    mcAt: 9_000_000,
    timesCalled: 3,
    tracking: '3x from last call',
    breakdown: [{ factor: 'LIQUIDITY', delta: 8, note: 'deep' }],
  },
  {
    mentionId: 'ch-gamma:300:0',
    kolId: 'ch-gamma',
    score: 66,
    rankScore: 66,
    rank: 3,
    strategy: 'score',
    scoredAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    ticker: 'POPCAT',
    chain: 'solana',
    address: 'Addr3333333333333333333333333333333333333333',
    mcAt: 1_200_000,
    timesCalled: 2,
    tracking: '2x from last call',
    breakdown: [],
  },
];

function rankingsFor(window: string) {
  const scale = window === '1d' ? 1 : window === '7d' ? 5 : 10;
  return Array.from({ length: 10 }, (_, i) => ({
    caller: `caller-${i}`,
    window,
    totalX: (10 - i) * scale,
    callsCount: (i + 1) * (window === '30d' ? 3 : 1),
    strongCalls: i < 2 ? 1 : 0,
    display: window === '1d' ? `+${(10 - i) * 10}%` : `+${(10 - i) * scale}X`,
  }));
}

async function mockKolSystem(page: Page, opts?: { failCalls?: boolean }) {
  await page.route('**/kol-api/**', (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/kol-api/, '/api');
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/templates' && method === 'GET') {
      return json(TEMPLATES);
    }
    if (path === '/api/templates/vip-calls' && method === 'GET') {
      return json(TEMPLATES[0]);
    }
    if (path === '/api/templates/vip-calls/rankings' && method === 'GET') {
      if (opts?.failCalls) {
        return route.fulfill({ status: 500, body: 'boom' });
      }
      return json({ templateId: 'vip-calls', strategy: 'score', ranked: RANKED });
    }
    if (path === '/api/templates/vip-calls/sources' && method === 'PATCH') {
      const ids = JSON.parse(route.request().postData() ?? '[]') as Array<string>;
      return json({ ...TEMPLATES[0], kolSourceIds: ids });
    }
    if (path === '/api/kol-rankings' && method === 'GET') {
      const window = url.searchParams.get('window') ?? '30d';
      return json(rankingsFor(window));
    }
    return route.fallback();
  });
  await page.route('**/ingestion-api/**', (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/ingestion-api/feed/sources') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SOURCES),
      });
    }
    if (url.pathname.startsWith('/ingestion-api/kol-avatar/')) {
      return route.fulfill({ status: 404, body: 'no avatar' });
    }
    return route.fallback();
  });
}

test.beforeEach(async ({ page }) => {
  await mockKolSystem(page);
});

test('kol calls table shows First time and Nx rows', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByTestId('kol-calls-table')).toBeVisible();
  await expect(page.getByText('First time').first()).toBeVisible();
  await expect(page.getByText('3x from last call').first()).toBeVisible();
  await expect(page.getByTestId('db-id-ch-alpha:100:0')).toBeVisible();
  await page.getByTestId('more-details-ch-alpha:100:0').click();
  await expect(page.getByTestId('details-ch-alpha:100:0')).toBeVisible();
});

test('kol rankings table renders one row per window', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByTestId('kol-rankings-table')).toBeVisible();
  for (const window of ['30d', '7d', '1d'] as const) {
    await page.getByTestId(`window-${window}`).click();
    await expect(page.getByTestId('top-callers-list')).toBeVisible();
    await expect(page.getByTestId('top-caller-caller-0')).toBeVisible();
  }
  await expect(page.getByTestId('perf-card-caller-0')).toBeVisible();
});

test('template sources filter narrows to two sources and clears to all', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByTestId('kol-calls-table')).toBeVisible();
  expect(await page.getByTestId(/call-row-/).count()).toBe(3);
  await page.getByTestId('source-option-ch-gamma').click();
  await expect(page.getByTestId('call-row-ch-gamma:300:0')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('call-row-ch-alpha:100:0')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('call-row-ch-beta:200:0')).toBeHidden({ timeout: 10_000 });
  await page.getByTestId('sources-clear').click();
  await expect(page.getByTestId(/call-row-/).first()).toBeVisible();
});

test('dashboard layout has 5+5 ranking halves with arrows and window selector', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByTestId('perf-half-left')).toBeVisible();
  await expect(page.getByTestId('perf-half-right')).toBeVisible();
  expect(await page.getByTestId('perf-half-left').locator('[data-testid^="perf-card-"]').count()).toBe(5);
  expect(await page.getByTestId('perf-half-right').locator('[data-testid^="perf-card-"]').count()).toBe(5);
  const firstBefore = await page.getByTestId('perf-half-left').locator('[data-testid^="perf-card-"]').first().getAttribute('data-testid');
  await page.getByTestId('perf-sort-toggle').click();
  const firstAfter = await page.getByTestId('perf-half-left').locator('[data-testid^="perf-card-"]').first().getAttribute('data-testid');
  expect(firstAfter).not.toBe(firstBefore);
  await expect(page.getByTestId('window-selector')).toBeVisible();
  const countBefore = await page.getByTestId('top-caller-count-caller-0').textContent();
  await page.getByTestId('window-7d').click();
  await expect(page.getByTestId('top-caller-count-caller-0')).not.toHaveText(countBefore ?? '', { timeout: 10_000 });
  await expect(page.getByTestId('template-config')).toBeVisible();
});

test('API down renders empty states without crashing', async ({ page }) => {
  await page.route('**/kol-api/**', (route: Route) => route.fulfill({ status: 500, body: 'down' }));
  await page.route('**/ingestion-api/**', (route: Route) => route.fulfill({ status: 500, body: 'down' }));
  await page.goto('/templates');
  await expect(page.getByTestId('template-dashboard-empty')).toBeVisible();
});

test('avatar 404 falls back to placeholder', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByTestId('kol-calls-table')).toBeVisible();
  await expect(page.getByTestId('avatar-placeholder-ch-alpha')).toBeVisible();
});

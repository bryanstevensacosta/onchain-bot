import { expect, test, type Route } from '@playwright/test';

test('manual QA screenshots + legacy dashboard intact', async ({ page }) => {
  await page.route('**/kol-api/**', (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/kol-api/, '/api');
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/templates') {
      return json([
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
      ]);
    }
    if (path === '/api/templates/vip-calls') {
      return json({
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
      });
    }
    if (path === '/api/templates/vip-calls/rankings') {
      return json({
        templateId: 'vip-calls',
        strategy: 'score',
        ranked: [
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
        ],
      });
    }
    if (path === '/api/kol-rankings') {
      const window = url.searchParams.get('window') ?? '30d';
      return json(
        Array.from({ length: 10 }, (_, i) => ({
          caller: `caller-${i}`,
          window,
          totalX: (10 - i) * 10,
          callsCount: i + 1,
          strongCalls: 0,
          display: `+${(10 - i) * 10}X`,
        })),
      );
    }
    return route.fallback();
  });
  await page.route('**/ingestion-api/feed/sources*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { channelId: 'ch-alpha', handle: '@alpha', title: 'Alpha', avatarUrl: null, url: 'https://t.me/alpha' },
        { channelId: 'ch-beta', handle: '@beta', title: 'Beta', avatarUrl: null, url: 'https://t.me/beta' },
      ]),
    }),
  );
  await page.goto('/templates');
  await expect(page.getByTestId('kol-calls-table')).toBeVisible();
  await page.screenshot({ path: '../../.omo/evidence/task-14-template-dashboard.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.screenshot({ path: '../../.omo/evidence/task-14-legacy-dashboard.png' });
});

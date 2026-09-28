import { expect, test, type Page, type Route } from '@playwright/test';

const PROFILE = {
  id: 'desk-alpha',
  name: 'Desk Alpha',
  templateId: null,
  active: true,
  matchingEnabled: true,
  publishingEnabled: true,
  llmEnabled: true,
  keywordIds: ['k1'],
  sourceToggles: { '-1001': true, '-1002': false },
  telegramTargets: [{ botId: 'b1', chatId: '-1009' }],
  threadsTargets: [],
  canConsume: true,
  canPublish: true,
};

const SOURCES = [
  {
    channelId: '-1001',
    handle: 'alpha',
    title: 'Alpha',
    isActive: true,
    lifecycleStatus: 'active',
    addedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    channelId: '-1002',
    handle: 'beta',
    title: 'Beta',
    isActive: true,
    lifecycleStatus: 'active',
    addedAt: '2026-09-01T00:00:00.000Z',
  },
];

const MESSAGES = [
  {
    id: 'm1',
    channelId: '-1001',
    messageId: 7,
    title: null,
    content: 'spot etf inflows breaking',
    publishedAt: '2026-09-28T00:00:00.000Z',
    ingestedAt: '2026-09-28T00:00:00.000Z',
    media: [],
    linkPreviewUrl: null,
    linkPreviewTitle: null,
    linkPreviewDescription: null,
    linkPreviewSiteName: null,
  },
];

test.describe('profiles (Tramo 2, todo 16)', () => {
  let sessionState: typeof PROFILE;

  async function mockProfiles(page: Page) {
    sessionState = {
      ...PROFILE,
      sourceToggles: { ...PROFILE.sourceToggles },
    };
    await page.route('**/ingestion-api/**', (route: Route) => {
      const url = new URL(route.request().url());
      const json = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (url.pathname.includes('/feed/messages')) {
        return json({
          timestamp: new Date().toISOString(),
          count: MESSAGES.length,
          data: MESSAGES,
        });
      }
      return json(SOURCES);
    });

    await page.route('**/feed-api/**', (route: Route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^\/feed-api/, '');
      const method = route.request().method();
      const json = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });

      if (path === '/api/sessions' && method === 'GET') {
        return json([sessionState]);
      }
      if (path === '/api/content-templates' && method === 'GET') {
        return json([]);
      }
      if (path === '/feed-publisher/keywords' && method === 'GET') {
        return json([
          {
            id: 'k1',
            phrase: 'etf',
            caseSensitive: false,
            sourceChannelIds: [],
            enabled: true,
            andGroupId: null,
            requireMedia: false,
            templateId: null,
            matchMode: 'substring',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ]);
      }
      if (path === '/feed-publisher/blacklist' && method === 'GET') {
        return json([
          {
            id: 'b1',
            phrase: 'scam',
            caseSensitive: false,
            matchMode: 'substring',
            sourceChannelIds: [],
            enabled: true,
            andGroupId: null,
            requireMedia: false,
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ]);
      }
      if (path === '/api/queue' && method === 'GET') return json([]);
      if (path === '/api/queue/stats' && method === 'GET') {
        return json({
          pending: 0,
          scheduled: 0,
          publishing: 0,
          published: 1,
          failed: 0,
          blocked: 0,
          total: 1,
          lastTickAt: null,
          lastProcessedAt: null,
          consecutiveFailures: 0,
        });
      }
      if (
        path === '/feed-publisher/matching/messages/-1001/7/status' &&
        method === 'GET'
      ) {
        return json({
          channelId: '-1001',
          messageId: 7,
          ingested: true,
          matched: true,
          blocked: false,
          matchedKeywords: [{ id: 'k1', phrase: 'etf' }],
          blockedBy: [],
          reasons: ['matched keyword "etf"'],
          filteredTitle: null,
          filteredContent: 'spot etf inflows breaking',
          rawTitle: null,
          rawContent: 'spot etf inflows breaking',
          queue: null,
          badge: 'Pending to publish',
        });
      }
      if (
        path === '/feed-publisher/sources/-1001/filters' &&
        method === 'GET'
      ) {
        return json([]);
      }
      if (path === '/api/llm/config' && method === 'GET') {
        return json({
          defaultTemplateId: 't1',
          targetChannel: '-1009',
          llmEnabled: true,
          publishingEnabled: true,
          rejectNonLatin: false,
          dailyCap: 100,
          dailyResetUtcHour: 0,
          randomDelayMinMs: 0,
          randomDelayMaxMs: 0,
          llmMaxAttempts: 3,
          updatedAt: '2026-09-01T00:00:00.000Z',
        });
      }
      if (path === '/api/llm/flags' && method === 'GET') {
        return json({
          flags: { matching: true, llm: true, publishing: true },
          llmActive: true,
          mode: 'full-pipeline',
        });
      }
      if (path === '/api/sessions/desk-alpha/sources' && method === 'PATCH') {
        const body = JSON.parse(route.request().postData() ?? '{}') as {
          sourceId?: string;
          enabled?: boolean;
        };
        sessionState = {
          ...sessionState,
          sourceToggles: {
            ...sessionState.sourceToggles,
            [body.sourceId ?? '']: body.enabled ?? false,
          },
        };
        return json(sessionState);
      }
      return json({ error: `unmocked ${method} ${path}` }, 404);
    });
  }

  test('header, tabs and status badges render', async ({ page }) => {
    await mockProfiles(page);
    await page.goto('/profiles');
    await expect(page.getByTestId('profiles-header')).toContainText(
      '[Profile: Desk Alpha]',
    );
    for (const tab of [
      'sources',
      'keywords',
      'queue',
      'target',
      'filters',
      'llm',
    ]) {
      await expect(page.getByTestId(`profile-tab-${tab}`)).toBeVisible();
    }
    await expect(page.getByTestId('status-badge--1001-7')).toContainText(
      'Pending to publish',
    );
  });

  test('sources toggles PATCH per-profile', async ({ page }) => {
    await mockProfiles(page);
    await page.goto('/profiles');
    await page.getByTestId('profile-tab-sources').click();
    const toggle = page.getByTestId('source-toggle--1002');
    await expect(toggle).toHaveText('Off');
    await toggle.click();
    await expect(page.getByTestId('source-toggle--1002')).toHaveText('On');
  });

  test('keywords tables, queue, target, filters and llm tabs render', async ({
    page,
  }) => {
    await mockProfiles(page);
    await page.goto('/profiles');

    await page.getByTestId('profile-tab-keywords').click();
    await expect(page.getByTestId('keywords-allowed-table')).toContainText(
      'etf',
    );
    await expect(page.getByTestId('keywords-blocked-table')).toContainText(
      'scam',
    );

    await page.getByTestId('profile-tab-target').click();
    await expect(page.getByTestId('target-tab')).toContainText('-1009');

    await page.getByTestId('profile-tab-filters').click();
    await expect(page.getByTestId('filters-tab')).toBeVisible();

    await page.getByTestId('profile-tab-llm').click();
    await expect(page.getByTestId('llm-config-section')).toContainText(
      'full-pipeline',
    );
  });

  test('recent details modal opens fixed with scroll', async ({ page }) => {
    await mockProfiles(page);
    await page.goto('/profiles');
    await page.getByTestId('recent-open--1001-7').click();
    const modal = page.getByTestId('recent-details-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('matched keyword "etf"');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });

  test('manage modal validates names and previews the normalized id', async ({
    page,
  }) => {
    await mockProfiles(page);
    await page.goto('/profiles');
    await page.getByTestId('manage-profile-button').click();
    await page.getByTestId('profile-name-input').fill('My New Desk!!');
    await expect(page.getByTestId('profile-id-preview')).toContainText(
      'my-new-desk',
    );
    await page.getByTestId('profile-name-input').fill('-bad-');
    await expect(page.getByTestId('profile-name-error')).toBeVisible();
  });
});

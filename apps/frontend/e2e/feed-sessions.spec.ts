import { expect, test, type Page, type Route } from '@playwright/test';

const SESSION = {
  id: 'desk-alpha',
  name: 'desk-alpha',
  templateId: 't-breakout',
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

const TEMPLATES = [
  {
    id: 't-breakout',
    name: 'Breakout',
    active: true,
    sourceIds: ['-1001'],
    keywordIds: ['k1'],
    promptTemplateId: null,
    targets: ['telegram'],
    botBindings: [{ botId: 'b1', target: 'telegram', chatId: '-1009' }],
    matchingEnabled: false,
    llmEnabled: true,
    publishingEnabled: true,
    scheduleMode: 'live',
    canPublish: true,
  },
];

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

test.describe('feed sessions (P34-ter window, on /feed)', () => {
  let sessionState: typeof SESSION;
  let templatesState: typeof TEMPLATES;

  async function mockSessions(page: Page) {
    sessionState = {
      ...SESSION,
      sourceToggles: { ...SESSION.sourceToggles },
    };
    templatesState = TEMPLATES.map((t) => ({ ...t }));
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
      // P34-ter: source toggles are staged in the window draft and applied
      // with one Save (PATCH /api/sessions/:id), not per-toggle PATCH.
      if (path === '/api/sessions/desk-alpha' && method === 'PATCH') {
        const body = JSON.parse(route.request().postData() ?? '{}') as Partial<
          typeof SESSION
        >;
        sessionState = { ...sessionState, ...body };
        return json(sessionState);
      }
      if (path === '/api/content-templates' && method === 'GET') {
        return json(templatesState);
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
      return json({ error: `unmocked ${method} ${path}` }, 404);
    });
  }

  test('legacy /profiles redirects to /feed', async ({ page }) => {
    await mockSessions(page);
    await page.goto('/profiles');
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByTestId('sessions-header')).toBeVisible();
  });

  test('session header dropdown, template name and six P34-ter tabs render', async ({
    page,
  }) => {
    await mockSessions(page);
    await page.goto('/feed');
    await expect(page.getByTestId('sessions-header')).toContainText('Session');
    await expect(page.getByTestId('session-picker')).toContainText(
      '● desk-alpha',
    );
    await expect(page.getByTestId('session-template-name')).toContainText(
      'template: Breakout',
    );
    for (const tab of [
      'overview',
      'sources',
      'keywords',
      'filters',
      'llm',
      'target',
    ]) {
      await expect(page.getByTestId(`session-tab-${tab}`)).toBeVisible();
    }
    await expect(page.getByTestId('session-tab-queue')).toHaveCount(0);
    await expect(page.getByTestId('session-window')).toBeVisible();
    await expect(page.getByTestId('status-badge--1001-7')).toContainText(
      'Pending to publish',
    );
    await page.screenshot({
      path: test.info().outputPath('feed-sessions.png'),
    });
  });

  test('sources toggles stage locally and apply on Save', async ({ page }) => {
    await mockSessions(page);
    await page.goto('/feed');
    await page.getByTestId('session-tab-sources').click();
    const toggle = page.getByTestId('source-toggle--1002');
    await expect(toggle).toHaveText('Off');
    await toggle.click();
    await expect(page.getByTestId('source-toggle--1002')).toHaveText('On');
    await expect(page.getByTestId('window-dirty')).toContainText(
      'Unsaved changes',
    );
    await expect(page.getByTestId('source-staged--1002')).toBeVisible();
    await page.getByTestId('window-save').click();
    await expect(page.getByTestId('window-dirty')).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath('session-window-sources.png'),
    });
  });

  test('window name lowercases live and template load applies with confirm', async ({
    page,
  }) => {
    await mockSessions(page);
    await page.goto('/feed');
    await page.getByTestId('window-session-name').fill('My Desk 42');
    await expect(page.getByTestId('window-session-name')).toHaveValue(
      'my desk 42',
    );
    await expect(page.getByTestId('window-name-error')).toBeVisible();
    // Template load: fixture template has matchingEnabled=false, session
    // starts with matching on → loading flips the staged switch off.
    // The renamed draft is dirty, so Load asks for confirm first.
    await page.getByTestId('window-template-select').selectOption('t-breakout');
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId('window-template-load').click();
    await expect(
      page.getByTestId('session-switch-matchingEnabled'),
    ).toContainText('Matching: off');
  });

  test('keywords tables, target rows, filters and llm tabs render', async ({
    page,
  }) => {
    await mockSessions(page);
    await page.goto('/feed');

    await page.getByTestId('session-tab-keywords').click();
    await expect(page.getByTestId('keywords-allowed-table')).toContainText(
      'etf',
    );
    await expect(page.getByTestId('keywords-blocked-table')).toContainText(
      'scam',
    );

    await page.getByTestId('session-tab-overview').click();
    await page.getByTestId('overview-target-telegram--1009').click();
    await expect(page.getByTestId('target-tab')).toContainText('-1009');
    await expect(page.getByTestId('target-row-telegram--1009')).toContainText(
      'bot b1 → -1009',
    );
    await page.screenshot({
      path: test.info().outputPath('session-window-target.png'),
    });

    await page.getByTestId('session-tab-filters').click();
    await expect(page.getByTestId('filters-tab')).toBeVisible();

    await page.getByTestId('session-tab-llm').click();
    await expect(page.getByTestId('llm-config-section')).toContainText(
      'full-pipeline',
    );
  });

  test('recent details modal opens fixed with scroll', async ({ page }) => {
    await mockSessions(page);
    await page.goto('/feed');
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
    await mockSessions(page);
    await page.goto('/feed');
    await page.getByTestId('manage-session-button').click();
    await page.getByTestId('session-name-input').fill('My New Desk!!');
    await expect(page.getByTestId('session-id-preview')).toContainText(
      'my-new-desk',
    );
    await page.getByTestId('session-name-input').fill('-bad-');
    await expect(page.getByTestId('session-name-error')).toBeVisible();
  });
});

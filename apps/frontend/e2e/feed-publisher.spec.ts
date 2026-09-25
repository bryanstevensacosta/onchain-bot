import { expect, test, type Page, type Route } from '@playwright/test';

test.describe('feed-publisher (Tramo 2, todo 9)', () => {
  async function mockFeedPublisher(page: Page) {
    await page.route('**/ingestion-api/**', (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/feed/messages')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ timestamp: new Date().toISOString(), count: 0, data: [] }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/feed-api/**', (route: Route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^\/feed-api/, '');
      const method = route.request().method();
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

      if (path === '/api/queue/stats' && method === 'GET') {
        return json({
          pending: 3,
          scheduled: 1,
          publishing: 0,
          published: 12,
          failed: 2,
          blocked: 1,
          total: 19,
          lastTickAt: null,
          lastProcessedAt: null,
          consecutiveFailures: 0,
        });
      }
      if (path === '/feed-publisher/matching/config' && method === 'GET') {
        return json({ id: 1, enabled: false, updatedAt: new Date().toISOString() });
      }
      if (path === '/feed-publisher/matching/config' && method === 'PATCH') {
        const body = JSON.parse(route.request().postData() ?? '{}') as { enabled?: boolean };
        return json({ id: 1, enabled: body.enabled ?? true, updatedAt: new Date().toISOString() });
      }
      if (path === '/feed-publisher/matching/health' && method === 'GET') {
        return json({
          enabled: false,
          lastTickAt: null,
          lastFetchOk: true,
          consecutiveFetchFailures: 0,
          lastEnqueuedAt: null,
          queuePending: 3,
        });
      }
      if (path === '/api/llm/config' && method === 'GET') {
        return json({
          defaultTemplateId: 'tpl-1',
          targetChannel: '@news',
          llmEnabled: true,
          publishingEnabled: false,
          rejectNonLatin: true,
          dailyCap: 50,
          dailyResetUtcHour: 0,
          randomDelayMinMs: 1000,
          randomDelayMaxMs: 5000,
          llmMaxAttempts: 3,
          updatedAt: new Date().toISOString(),
        });
      }
      if (path === '/api/llm/config' && method === 'PATCH') {
        const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
        return json({
          defaultTemplateId: 'tpl-1',
          targetChannel: '@news',
          llmEnabled: true,
          publishingEnabled: false,
          rejectNonLatin: true,
          dailyCap: 50,
          dailyResetUtcHour: 0,
          randomDelayMinMs: 1000,
          randomDelayMaxMs: 5000,
          llmMaxAttempts: 3,
          updatedAt: new Date().toISOString(),
          ...body,
        });
      }
      if (path === '/api/llm/flags' && method === 'GET') {
        return json({
          flags: { matching: false, llm: true, publishing: false },
          llmActive: false,
          mode: 'enqueue-only',
        });
      }
      if (path === '/api/llm/models' && method === 'GET') {
        return json([{ id: 'gpt-test' }]);
      }
      if (path === '/api/llm/templates' && method === 'GET') {
        return json([]);
      }
      if (path === '/api/scheduling/ads' && method === 'GET') {
        return json([]);
      }
      if (path === '/api/scheduling/rotation-config' && method === 'GET') {
        return json({ enabled: true, everyNPosts: 6, minMinutesBetweenAds: 45 });
      }
      if (path === '/api/scheduling/media/library' && method === 'GET') {
        return json([]);
      }
      if (path === '/api/threads') {
        return json(
          {
            error: 'THREADS_NOT_IMPLEMENTED',
            message: 'Thread support is deferred to v2 (see src/threads/CONTRACT.md). No threads publishing in v1.',
          },
          501,
        );
      }
      return route.fallback();
    });

    // Legacy backend surface the newsroom still reads (queue list,
    // keywords/phrases/blacklist): empty but healthy.
    await page.route('**/crypto-news-publisher/**', (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/queue/counts')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ pending: 0, publishedToday: 0, remaining: 50 }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/crypto-news-scheduling/**', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );
    await page.route('**/crypto-news/sources/**', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );
  }

  test('queue stats strip renders feed-publisher depth', async ({ page }) => {
    await mockFeedPublisher(page);
    await page.goto('/crypto-news');
    const strip = page.getByTestId('feed-queue-stats');
    await expect(strip).toBeVisible();
    await expect(strip.getByText('Pending')).toBeVisible();
    await expect(strip.getByText('19')).toBeVisible();
  });

  test('3-flag toggles write the feed-publisher endpoints', async ({ page }) => {
    await mockFeedPublisher(page);
    let matchingPatch: Record<string, unknown> | null = null;
    await page.route(
      '**/feed-api/feed-publisher/matching/config',
      (route: Route, request) => {
        if (request.method() === 'PATCH') {
          matchingPatch = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        }
        return route.fallback();
      },
    );
    await page.goto('/crypto-news');
    const toggles = page.getByTestId('matching-toggle-button');
    await expect(toggles).toBeVisible();
    await expect(page.getByTestId('pipeline-mode')).toContainText('enqueue-only');
    await toggles.getByRole('button', { name: /Start Keyword Matching/ }).click();
    await expect.poll(() => matchingPatch).toEqual({ enabled: true });
  });

  test('scheduling rotation config renders from feed-publisher', async ({ page }) => {
    await mockFeedPublisher(page);
    await page.goto('/crypto-news');
    await expect(page.getByLabel(/Every N posts/)).toHaveValue('6');
    await expect(page.getByLabel(/Min minutes between ads/)).toHaveValue('45');
  });

  test('threads section shows the 501 stub and API-down degrades to empty states', async ({
    page,
  }) => {
    await mockFeedPublisher(page);
    await page.goto('/crypto-news');
    await page.getByText('Threads (feed-publisher v1)').click();
    await expect(page.getByTestId('feed-threads-stub')).toContainText(
      'Threads deferred to v2',
    );

    // Adversarial: feed-publisher down → stub + stats hide, page survives.
    await page.unroute('**/feed-api/**');
    await page.route('**/feed-api/**', (route: Route) =>
      route.fulfill({ status: 500, body: 'down' }),
    );
    await page.reload();
    await expect(page.getByText('Crypto News')).toBeVisible();
    await page.getByText('Threads (feed-publisher v1)').click();
    await expect(page.getByTestId('feed-threads-empty')).toBeVisible();
    await expect(page.getByTestId('feed-queue-stats')).toHaveCount(0);
  });
});

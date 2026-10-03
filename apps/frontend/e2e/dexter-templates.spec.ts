import { expect, test, type Page, type Route } from '@playwright/test';

interface TemplateRow {
  id: string;
  command: string;
  name: string;
  bodyMarkdown: string;
  isActive: boolean;
  version: number;
}

const seedTemplates = (): TemplateRow[] => [
  {
    id: 'tpl-ca-1',
    command: 'ca',
    name: 'full-dexter-v1',
    bodyMarkdown: '*{{symbol}}* | {{name}} — {{chain}}\n`{{address}}`',
    isActive: true,
    version: 2,
  },
  {
    id: 'tpl-ca-2',
    command: 'ca',
    name: 'compact-rick-v1',
    bodyMarkdown: '${{symbol}} | {{name}}',
    isActive: false,
    version: 1,
  },
  {
    id: 'tpl-c-1',
    command: 'c',
    name: 'chart-v1',
    bodyMarkdown: '📈 Chart ({{timeframe}}): {{dexscreenerUrl}}',
    isActive: true,
    version: 1,
  },
];

const PLACEHOLDERS = [
  { key: 'symbol', type: 'string', nullable: false, example: 'BONK' },
  { key: 'chainDisplay', type: 'string', nullable: true, example: '' },
];

const DISPLAY_MAPS = [
  {
    id: 'dm-1',
    placeholderKey: 'chain',
    matchValue: 'solana',
    display: 'SOL',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
];

function view(row: TemplateRow) {
  return {
    ...row,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

async function mockDexter(page: Page, opts: { down?: boolean } = {}) {
  const templates = seedTemplates();
  await page.route('**/dexter-api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/dexter-api/, '');
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (opts.down) {
      return json({ message: 'down' }, 500);
    }

    // List (optional ?command= filter).
    if (path === '/api/dexter/templates' && method === 'GET') {
      const command = url.searchParams.get('command');
      const rows = command
        ? templates.filter((t) => t.command === command)
        : templates;
      return json(rows.map(view));
    }

    // Create: duplicate (command, name) → 409, else append (stateful mock).
    if (path === '/api/dexter/templates' && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        command: string;
        name: string;
        bodyMarkdown: string;
      };
      const dupe = templates.some(
        (t) => t.command === body.command && t.name === body.name,
      );
      if (dupe) {
        return json(
          {
            message: {
              error: `A template with name ${body.name} already exists for command ${body.command}`,
            },
            statusCode: 409,
          },
          409,
        );
      }
      const row: TemplateRow = {
        id: `tpl-${body.command}-9`,
        command: body.command,
        name: body.name,
        bodyMarkdown: body.bodyMarkdown,
        isActive: false,
        version: 1,
      };
      templates.push(row);
      return json(view(row));
    }

    // Update: rename + body with version++ per change (stateful mock).
    const updateMatch = path.match(/^\/api\/dexter\/templates\/([^/]+)$/);
    if (updateMatch && method === 'PATCH') {
      const target = templates.find((t) => t.id === updateMatch[1]);
      if (!target) return json({ message: 'not found' }, 404);
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        name?: string;
        bodyMarkdown?: string;
      };
      if (body.name !== undefined) target.name = body.name;
      if (body.bodyMarkdown !== undefined) target.bodyMarkdown = body.bodyMarkdown;
      target.version += 1;
      return json(view(target));
    }

    // Activate: transactional switch + version++ (stateful mock).
    const activateMatch = path.match(
      /^\/api\/dexter\/templates\/([^/]+)\/activate$/,
    );
    if (activateMatch && method === 'POST') {
      const target = templates.find((t) => t.id === activateMatch[1]);
      if (!target) return json({ message: 'not found' }, 404);
      for (const t of templates) {
        if (t.command === target.command) t.isActive = t.id === target.id;
      }
      target.version += 1;
      return json(view(target));
    }

    // Preview: templateId XOR draft + address XOR token (+ timeframe c/cc only).
    let liveCalls = 0;
    if (path === '/api/dexter/templates/preview' && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        templateId?: string;
        draft?: { command: string; bodyMarkdown: string };
        address?: string;
        token?: { address: string; chain: string; symbol: string };
        timeframe?: string;
      };
      const hasId = body.templateId !== undefined;
      const hasDraft = body.draft !== undefined;
      if (hasId === hasDraft) {
        return json(
          {
            message: {
              error: 'provide exactly one of templateId or draft',
            },
            statusCode: 400,
          },
          400,
        );
      }
      const hasAddress = body.address !== undefined;
      const hasToken = body.token !== undefined;
      if (hasAddress === hasToken) {
        return json(
          {
            message: {
              error: 'provide exactly one of address or token',
            },
            statusCode: 400,
          },
          400,
        );
      }
      if (body.address === 'bad-address') {
        return json({
          error: 'Ambiguous address: 2 chains',
          address: 'bad-address',
          candidates: ['ethereum:bad-address', 'base:bad-address'],
        });
      }
      const command = hasDraft
        ? (body.draft?.command ?? 'ca')
        : (templates.find((t) => t.id === body.templateId)?.command ?? 'ca');
      if (body.timeframe !== undefined && command !== 'c' && command !== 'cc') {
        return json(
          {
            message: {
              error: `timeframe is only valid for c/cc templates (command: ${command})`,
            },
            statusCode: 400,
          },
          400,
        );
      }
      // Token path: frozen snapshot, pipeline skipped — same text shape.
      if (hasToken) {
        liveCalls += 1;
        const delayMs = liveCalls === 1 ? 900 : 100;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return json({
          text: `LIVE:${body.draft?.bodyMarkdown ?? ''}`,
          truncated: false,
          parseMode: 'MarkdownV2',
          placeholdersUsed: ['symbol'],
          unknown: [],
        });
      }
      return json({
        text: `*BONK* | Bonk — ${command}\n\`${body.address ?? ''}\``,
        truncated: true,
        parseMode: 'MarkdownV2',
        placeholdersUsed: ['symbol', 'name'],
        unknown: [],
        token: {
          address: body.address ?? '',
          chain: 'solana',
          symbol: 'BONK',
        },
      });
    }

    // Placeholders catalog (read-only).
    const phMatch = path.match(/^\/api\/dexter\/placeholders\/([^/]+)$/);
    if (phMatch && method === 'GET') {
      return json({ command: phMatch[1], placeholders: PLACEHOLDERS });
    }

    // Display-maps list.
    if (path === '/api/dexter/display-maps' && method === 'GET') {
      return json(DISPLAY_MAPS);
    }

    return json({ message: 'not mocked' }, 404);
  });
}

test.describe('dexter templates (Wave 1, Lane B)', () => {
  test('templates list renders + activate switches (stateful mock)', async ({
    page,
  }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-templates-list')).toBeVisible();
    await expect(
      page.getByTestId('dexter-template-row-tpl-ca-1'),
    ).toBeVisible();
    await expect(
      page.getByTestId('dexter-template-active-tpl-ca-1'),
    ).toContainText('active');

    // tpl-ca-2 is idle while tpl-ca-1 is active → confirm step first.
    await page.getByTestId('dexter-template-activate-tpl-ca-2').click();
    await expect(
      page.getByTestId('dexter-template-activate-confirm-tpl-ca-2'),
    ).toBeVisible();
    await page.getByTestId('dexter-template-activate-confirm-tpl-ca-2').click();
    await expect(
      page.getByTestId('dexter-template-active-tpl-ca-2'),
    ).toContainText('active');
    await expect(
      page.getByTestId('dexter-template-row-tpl-ca-1'),
    ).not.toContainText('active');
  });

  test('preview by-id renders Markdown + chips + truncated badge', async ({
    page,
  }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await page.getByTestId('dexter-preview-mode-id').click();
    await page.getByTestId('dexter-preview-template-id').fill('tpl-ca-1');
    await page
      .getByTestId('dexter-preview-address')
      .fill('So11111111111111111111111111111111111111112');
    await page.getByTestId('dexter-preview-submit').click();
    const result = page.getByTestId('dexter-preview-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('BONK');
    await expect(result).toContainText('symbol');
    await expect(result).toContainText('truncated');
  });

  test('unresolvable address shows the unresolved state', async ({ page }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await page.getByTestId('dexter-preview-mode-id').click();
    await page.getByTestId('dexter-preview-template-id').fill('tpl-ca-1');
    await page.getByTestId('dexter-preview-address').fill('bad-address');
    await page.getByTestId('dexter-preview-submit').click();
    await expect(page.getByTestId('dexter-preview-unresolved')).toContainText(
      'Ambiguous',
    );
    await expect(page.getByTestId('dexter-preview-unresolved')).toContainText(
      'ethereum:bad-address',
    );
  });

  test('timeframe is disabled outside c/cc', async ({ page }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-preview-timeframe')).toBeDisabled();
    await page.getByTestId('dexter-preview-command').selectOption('c');
    await expect(page.getByTestId('dexter-preview-timeframe')).toBeEnabled();
    await expect(page.getByText(/Valid: 1m, 5m, 15m/)).toBeVisible();
  });

  test('placeholders + display-maps render', async ({ page }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-placeholders-table')).toBeVisible();
    await expect(
      page.getByTestId('dexter-placeholder-row-symbol'),
    ).toContainText('BONK');
    await expect(page.getByTestId('dexter-display-list')).toBeVisible();
    await expect(page.getByTestId('dexter-display-row-dm-1')).toContainText(
      'solana',
    );
  });

  test('API down renders empty states, never crashes', async ({ page }) => {
    await mockDexter(page, { down: true });
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-templates-empty')).toBeVisible();
    await expect(page.getByTestId('dexter-placeholders-empty')).toBeVisible();
    await expect(page.getByTestId('dexter-display-empty')).toBeVisible();
  });

  test('live editor loads once then re-renders stably while typing', async ({
    page,
  }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-live-section')).toBeVisible();
    await page
      .getByTestId('dexter-live-address')
      .fill('So11111111111111111111111111111111111111112');
    await page.getByTestId('dexter-live-load').click();
    const liveResult = page.getByTestId('dexter-live-result');
    await expect(liveResult).toContainText('BONK');
    await expect(
      page.getByTestId('dexter-live-placeholders'),
    ).toContainText('symbol');

    await page.getByTestId('dexter-live-editor').fill('hello live body');
    await expect(liveResult).toContainText('hello live body', {
      timeout: 10000,
    });
    await expect(liveResult).not.toContainText('BONK');
  });

  test('live editor discards the stale response', async ({ page }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await page
      .getByTestId('dexter-live-address')
      .fill('So11111111111111111111111111111111111111112');
    await page.getByTestId('dexter-live-load').click();
    const liveResult = page.getByTestId('dexter-live-result');
    await expect(liveResult).toContainText('BONK');

    // First keystroke burst fires a slow render; the second burst fires a
    // fast one that must win even though the slow response lands later.
    await page.getByTestId('dexter-live-editor').fill('first live body');
    await page.waitForTimeout(700);
    await page.getByTestId('dexter-live-editor').fill('second live body');
    await expect(liveResult).toContainText('second live body', {
      timeout: 10000,
    });
    await page.waitForTimeout(1500);
    await expect(liveResult).toContainText('second live body');
    await expect(liveResult).not.toContainText('first live body');
  });

  test('live editor save-as-new appears in the templates list', async ({
    page,
  }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-live-section')).toBeVisible();

    await page.getByTestId('dexter-live-save-name').fill('live-saved-v1');
    await page.getByTestId('dexter-live-save').click();
    await expect(
      page.getByTestId('dexter-template-row-tpl-ca-9'),
    ).toContainText('live-saved-v1');
    await expect(page.getByTestId('dexter-live-editing')).toContainText(
      'live-saved-v1',
    );
  });

  test('live editor pick → edit → save-back persists without a version badge', async ({
    page,
  }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-live-section')).toBeVisible();

    await page
      .getByTestId('dexter-live-template-picker')
      .selectOption('tpl-ca-2');
    await expect(page.getByTestId('dexter-live-editing')).toContainText(
      'Editing compact-rick-v1',
    );
    await expect(page.getByTestId('dexter-live-editing')).not.toContainText(
      '(v',
    );
    await page.getByTestId('dexter-live-editor').fill('edited live body');
    await page.getByTestId('dexter-live-save').click();
    await expect(page.getByTestId('dexter-live-editing')).toContainText(
      'Editing compact-rick-v1',
    );
    await expect(page.getByTestId('dexter-live-editing')).not.toContainText(
      '(v',
    );
  });

  test('live editor detach returns to a free draft', async ({ page }) => {
    await mockDexter(page);
    await page.goto('/dexter');
    await expect(page.getByTestId('dexter-live-section')).toBeVisible();

    await page
      .getByTestId('dexter-live-template-picker')
      .selectOption('tpl-ca-2');
    await expect(page.getByTestId('dexter-live-editing')).toBeVisible();
    await page.getByTestId('dexter-live-detach').click();
    await expect(
      page.getByTestId('dexter-live-editing'),
    ).not.toBeVisible();
  });
});

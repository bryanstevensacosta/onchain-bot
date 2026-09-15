import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LlmConfigMigrationService } from './llm-config-migration.service';
import {
  DEFAULT_CONFIG,
  type CryptoNewsPublisherConfigJson,
} from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';
import { LlmConfigEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/llm-config.entity';
import { PromptTemplateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity';

/**
 * Spec coverage for the three boot-time branches:
 *   - JSON present, DB empty     → seed (Branch A)
 *   - JSON present, DB populated → no-op (idempotent guard)
 *   - JSON absent, DB empty      → seed with defaults (Branch B)
 *
 * The service's pure-function core (`seedIfEmpty`) accepts a
 * `jsonConfig` argument so the spec can drive Branch A/B without
 * touching the filesystem. The third scenario exercises the
 * in-code-defaults path by stubbing `readJsonConfigOrNull` to return
 * null in `beforeEach`.
 */
describe('LlmConfigMigrationService.seedIfEmpty', () => {
  interface TransactionContext {
    manager: {
      findOne: jest.Mock;
      find: jest.Mock;
      save: jest.Mock;
    };
    savedCfgs: LlmConfigEntity[];
    savedTpls: PromptTemplateEntity[];
    staleTpls: PromptTemplateEntity[];
  }

  // The on-disk JSON file (`config/crypto-news-publisher.config.json`)
  // is part of the repo at Wave 1. To exercise "JSON absent" in the
  // spec we stub the static helper; restored after each test.
  let readJsonSpy: jest.SpyInstance;

  beforeEach(() => {
    readJsonSpy = jest
      .spyOn(LlmConfigMigrationService, 'readJsonConfigOrNull')
      .mockReturnValue(null);
  });

  afterEach(() => {
    readJsonSpy.mockRestore();
  });

  /** Helper: stage a fresh in-memory DataSource + mock manager. */
  const setupContext = (
    initialCfg: LlmConfigEntity | null,
    staleTpls: PromptTemplateEntity[] = [],
  ): TransactionContext => {
    const cfgLookup = new Map<number, LlmConfigEntity>();
    if (initialCfg) cfgLookup.set(initialCfg.id, initialCfg);
    const ctx: TransactionContext = {
      savedCfgs: [],
      savedTpls: [],
      staleTpls,
      manager: {
        findOne: jest.fn(),
        find: jest.fn(),
        save: jest.fn(),
      },
    };
    ctx.manager.findOne.mockImplementation(
      async (entity: unknown, opts: { where: { id: number } }) => {
        if (entity === LlmConfigEntity) {
          return cfgLookup.get(opts.where.id) ?? null;
        }
        return null;
      },
    );
    ctx.manager.find.mockImplementation(async (entity: unknown) => {
      if (entity === PromptTemplateEntity) {
        return [...ctx.staleTpls];
      }
      return [];
    });
    ctx.manager.save.mockImplementation(async (row: unknown) => {
      if (row instanceof LlmConfigEntity) {
        cfgLookup.set(row.id, row);
        ctx.savedCfgs.push(row);
        return row;
      }
      if (row instanceof PromptTemplateEntity) {
        ctx.savedTpls.push(row);
        return row;
      }
      throw new Error('unexpected entity in spec');
    });
    return ctx;
  };

  const makeService = (ctx: TransactionContext): LlmConfigMigrationService => {
    const dataSource = {
      transaction: jest.fn(
        async (cb: (m: TransactionContext['manager']) => Promise<unknown>) =>
          cb(ctx.manager),
      ),
    };
    // The unused repos are not exercised by `seedIfEmpty` (it goes
    // through the EntityManager only), so plain stubs are fine.
    const templateRepo = {} as never;
    const configRepo = {} as never;
    return new LlmConfigMigrationService(
      templateRepo,
      configRepo,
      dataSource as never,
    );
  };

  it('Branch A: JSON present, DB empty → seeds PromptTemplate + LlmConfig', async () => {
    const ctx = setupContext(null);
    const svc = makeService(ctx);

    const result = await svc.seedIfEmpty({
      enabled: true,
      targetChannel: '-1004371535900',
      publishing: {
        dailyCap: 36,
        dailyResetUtcHour: 4,
        randomDelayMinMs: 180_000,
        randomDelayMaxMs: 900_000,
        llmMaxAttempts: 3,
      },
      prompt: {
        model: 'custom-model',
        template: 'CUSTOM TEMPLATE {{original}}',
      },
    });

    expect(result.seeded).toBe(true);
    expect(result.templateCount).toBe(1);
    expect(ctx.savedCfgs).toHaveLength(1);
    expect(ctx.savedTpls).toHaveLength(1);

    const savedCfg = ctx.savedCfgs[0];
    const savedTpl = ctx.savedTpls[0];

    expect(savedCfg.id).toBe(1);
    expect(savedCfg.targetChannel).toBe('-1004371535900');
    expect(savedCfg.llmEnabled).toBe(true);
    expect(savedCfg.publishingEnabled).toBe(true);
    expect(savedCfg.rejectNonLatin).toBe(true);
    expect(savedCfg.dailyCap).toBe(36);
    expect(savedCfg.randomDelayMinMs).toBe(180_000);
    expect(savedCfg.randomDelayMaxMs).toBe(900_000);
    expect(savedCfg.llmMaxAttempts).toBe(3);

    expect(savedTpl.name).toBe('Default (imported)');
    expect(savedTpl.model).toBe('custom-model');
    expect(savedTpl.promptText).toBe('CUSTOM TEMPLATE {{original}}');
    // JSON without systemTemplate falls back to the hardened default.
    expect(savedTpl.systemPromptText).toBe(
      DEFAULT_CONFIG.prompt.systemTemplate,
    );
    expect(savedTpl.systemPromptText.length).toBeGreaterThan(0);
    expect(savedTpl.maxTokens).toBe(2000);
    expect(savedTpl.temperature).toBe(0.7);
    expect(savedTpl.reasoningEffort).toBeNull();

    // LlmConfig.defaultTemplateId references the freshly inserted template.
    expect(savedCfg.defaultTemplateId).toBe(savedTpl.id);
  });

  it('idempotent guard: JSON present, DB populated → no-op', async () => {
    const existingRow = new LlmConfigEntity();
    existingRow.id = 1;
    existingRow.defaultTemplateId = '00000000-0000-0000-0000-000000000001';
    existingRow.targetChannel = 'preset';
    existingRow.llmEnabled = false;
    existingRow.publishingEnabled = false;
    existingRow.dailyCap = 12;
    existingRow.dailyResetUtcHour = 6;
    existingRow.randomDelayMinMs = 1_000;
    existingRow.randomDelayMaxMs = 60_000;
    existingRow.llmMaxAttempts = 1;
    existingRow.updatedAt = new Date('2026-01-01T00:00:00Z');

    const ctx = setupContext(existingRow);
    const svc = makeService(ctx);

    const result = await svc.seedIfEmpty({
      enabled: true,
      targetChannel: '-100999',
      publishing: {
        dailyCap: 999,
        dailyResetUtcHour: 0,
        randomDelayMinMs: 10,
        randomDelayMaxMs: 20,
        llmMaxAttempts: 99,
      },
      prompt: { model: 'would-be-ignored', template: 'would-be-ignored' },
    });

    expect(result.seeded).toBe(false);
    expect(result.templateCount).toBe(0);
    expect(ctx.savedCfgs).toHaveLength(0);
    expect(ctx.savedTpls).toHaveLength(0);
    expect(existingRow.targetChannel).toBe('preset');
    expect(existingRow.dailyCap).toBe(12);
  });

  it('Branch B: JSON absent, DB empty → seeds with in-code defaults', async () => {
    const ctx = setupContext(null);
    const svc = makeService(ctx);

    // `readJsonConfigOrNull` is stubbed to null in beforeEach; calling
    // `seedIfEmpty()` with no argument falls through to that stub
    // and exercises the defaults branch.
    const result = await svc.seedIfEmpty();

    expect(result.seeded).toBe(true);
    expect(result.templateCount).toBe(1);
    expect(ctx.savedCfgs).toHaveLength(1);
    expect(ctx.savedTpls).toHaveLength(1);

    const savedTpl = ctx.savedTpls[0];
    const savedCfg = ctx.savedCfgs[0];

    expect(savedTpl.name).toBe('Default');
    expect(savedTpl.maxTokens).toBe(2000);
    expect(savedTpl.temperature).toBe(0.7);
    expect(savedTpl.reasoningEffort).toBeNull();
    expect(savedTpl.systemPromptText).toBe(
      DEFAULT_CONFIG.prompt.systemTemplate,
    );
    expect(savedTpl.promptText).toBe(DEFAULT_CONFIG.prompt.template);
    expect(savedTpl.promptText.length).toBeGreaterThan(0);

    expect(savedCfg.targetChannel).toBe('');
    expect(savedCfg.llmEnabled).toBe(false);
    expect(savedCfg.publishingEnabled).toBe(false);
    expect(savedCfg.rejectNonLatin).toBe(true);
    expect(savedCfg.dailyCap).toBe(36);
    expect(savedCfg.dailyResetUtcHour).toBe(4);
    expect(savedCfg.randomDelayMinMs).toBe(180_000);
    expect(savedCfg.randomDelayMaxMs).toBe(900_000);
    expect(savedCfg.llmMaxAttempts).toBe(3);
    expect(savedCfg.defaultTemplateId).toBe(savedTpl.id);
  });

  it('Branch A: missing fields in JSON fall back to defaults', async () => {
    const ctx = setupContext(null);
    const svc = makeService(ctx);

    await svc.seedIfEmpty({}); // all optional fields omitted

    expect(ctx.savedCfgs).toHaveLength(1);
    expect(ctx.savedTpls).toHaveLength(1);

    const savedTpl = ctx.savedTpls[0];
    const savedCfg = ctx.savedCfgs[0];

    expect(savedTpl.name).toBe('Default (imported)');
    expect(savedTpl.promptText).toBe(DEFAULT_CONFIG.prompt.template);
    expect(savedTpl.systemPromptText).toBe(
      DEFAULT_CONFIG.prompt.systemTemplate,
    );
    expect(savedCfg.dailyCap).toBe(36);
    expect(savedCfg.randomDelayMinMs).toBe(180_000);
    expect(savedCfg.randomDelayMaxMs).toBe(900_000);
    expect(savedCfg.llmMaxAttempts).toBe(3);
  });

  it('hardened seeds: system exige \\n\\n literales y prohíbe <br>', async () => {
    const ctx = setupContext(null);
    const svc = makeService(ctx);

    await svc.seedIfEmpty();

    const savedTpl = ctx.savedTpls[0];
    const system = savedTpl.systemPromptText ?? '';
    const user = savedTpl.promptText;

    expect(system.length).toBeGreaterThan(0);
    expect(system).toContain('\\n\\n');
    expect(system).toContain(LlmConfigMigrationService.HARDENED_SYSTEM_MARKER);
    expect(system).toContain('PROHIBIDO');
    expect(system).not.toMatch(/us(a|e)[^.]*`<br>`/i);
    expect(system).toContain('PROHIBIDO `<br>`, `<p>`, `</p>`');

    expect(user).toContain('{{original}}');
    expect(user).toContain('{{title}}');
    expect(user).toContain('{{hasImage}}');
    expect(user).toContain('\n\n');
    expect(user).toContain('PROHIBIDO `<br>`');
    expect(user).not.toMatch(/us(a|e)[^.]*`<br>`/i);
  });

  it('refresh: existing outdated Default row is rewritten, operator rows untouched', async () => {
    const existingRow = new LlmConfigEntity();
    existingRow.id = 1;
    existingRow.defaultTemplateId = 'stale-template-id';
    existingRow.targetChannel = 'preset';
    existingRow.llmEnabled = true;
    existingRow.publishingEnabled = true;
    existingRow.dailyCap = 36;
    existingRow.dailyResetUtcHour = 4;
    existingRow.randomDelayMinMs = 180_000;
    existingRow.randomDelayMaxMs = 900_000;
    existingRow.llmMaxAttempts = 3;
    existingRow.updatedAt = new Date('2026-08-28T00:00:00Z');

    const stale = new PromptTemplateEntity();
    stale.id = 'stale-template-id';
    stale.name = 'Default';
    stale.promptText = 'old user template';
    stale.systemPromptText = '';

    const ctx = setupContext(existingRow, [stale]);
    const svc = makeService(ctx);

    const result = await svc.seedIfEmpty({
      prompt: {
        model: 'custom-model',
        template: 'CUSTOM TEMPLATE {{original}}',
        systemTemplate: 'CUSTOM SYSTEM PROHIBIDO `<br>` \\n\\n body',
      },
    });

    expect(result.seeded).toBe(false);
    expect(result.templateCount).toBe(1);
    expect(stale.promptText).toBe('CUSTOM TEMPLATE {{original}}');
    expect(stale.systemPromptText).toBe(
      'CUSTOM SYSTEM PROHIBIDO `<br>` \\n\\n body',
    );
    expect(ctx.savedCfgs).toHaveLength(0);
  });

  it('refresh: skips already-hardened rows and never invents rows', async () => {
    const existingRow = new LlmConfigEntity();
    existingRow.id = 1;
    existingRow.defaultTemplateId = 'hardened-id';
    existingRow.targetChannel = 'preset';
    existingRow.llmEnabled = true;
    existingRow.publishingEnabled = true;
    existingRow.dailyCap = 36;
    existingRow.dailyResetUtcHour = 4;
    existingRow.randomDelayMinMs = 180_000;
    existingRow.randomDelayMaxMs = 900_000;
    existingRow.llmMaxAttempts = 3;
    existingRow.updatedAt = new Date('2026-08-28T00:00:00Z');

    const hardened = new PromptTemplateEntity();
    hardened.id = 'hardened-id';
    hardened.name = 'Default';
    hardened.promptText = DEFAULT_CONFIG.prompt.template;
    hardened.systemPromptText = DEFAULT_CONFIG.prompt.systemTemplate;

    const ctx = setupContext(existingRow, [hardened]);
    const svc = makeService(ctx);

    const result = await svc.seedIfEmpty();

    expect(result.seeded).toBe(false);
    expect(result.templateCount).toBe(0);
    expect(ctx.savedTpls).toHaveLength(0);
    expect(ctx.savedCfgs).toHaveLength(0);
    expect(hardened.promptText).toBe(DEFAULT_CONFIG.prompt.template);
  });

  it('drift: on-disk JSON mirror equals the in-code seed defaults', () => {
    const jsonPath = join(
      process.cwd(),
      'config',
      'crypto-news-publisher.config.json',
    );
    expect(existsSync(jsonPath)).toBe(true);
    const raw = JSON.parse(
      readFileSync(jsonPath, 'utf-8'),
    ) as CryptoNewsPublisherConfigJson;
    expect(raw.prompt?.template).toBe(DEFAULT_CONFIG.prompt.template);
    expect(raw.prompt?.systemTemplate).toBe(
      DEFAULT_CONFIG.prompt.systemTemplate,
    );
  });
});

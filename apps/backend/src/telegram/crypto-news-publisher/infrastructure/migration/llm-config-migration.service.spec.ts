import { LlmConfigMigrationService } from './llm-config-migration.service';
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
      save: jest.Mock;
    };
    savedCfgs: LlmConfigEntity[];
    savedTpls: PromptTemplateEntity[];
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
  ): TransactionContext => {
    const cfgLookup = new Map<number, LlmConfigEntity>();
    if (initialCfg) cfgLookup.set(initialCfg.id, initialCfg);
    const ctx: TransactionContext = {
      savedCfgs: [],
      savedTpls: [],
      manager: {
        findOne: jest.fn(),
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
    expect(savedCfg.enabled).toBe(true);
    expect(savedCfg.dailyCap).toBe(36);
    expect(savedCfg.randomDelayMinMs).toBe(180_000);
    expect(savedCfg.randomDelayMaxMs).toBe(900_000);
    expect(savedCfg.llmMaxAttempts).toBe(3);

    expect(savedTpl.name).toBe('Default (imported)');
    expect(savedTpl.model).toBe('custom-model');
    expect(savedTpl.promptText).toBe('CUSTOM TEMPLATE {{original}}');
    expect(savedTpl.systemPromptText).toBe('');
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
    existingRow.enabled = false;
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
    expect(savedTpl.systemPromptText).toBe('');
    expect(savedTpl.promptText.length).toBeGreaterThan(0);

    expect(savedCfg.targetChannel).toBe('');
    expect(savedCfg.enabled).toBe(false);
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
    expect(savedCfg.dailyCap).toBe(36);
    expect(savedCfg.randomDelayMinMs).toBe(180_000);
    expect(savedCfg.randomDelayMaxMs).toBe(900_000);
    expect(savedCfg.llmMaxAttempts).toBe(3);
  });
});

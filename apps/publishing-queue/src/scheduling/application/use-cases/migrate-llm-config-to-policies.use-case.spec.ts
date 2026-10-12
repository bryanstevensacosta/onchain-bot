import { MigrateLlmConfigToPoliciesUseCase } from './migrate-llm-config-to-policies.use-case';
import { InMemorySchedulingConfigRepository } from '@/scheduling/infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';
import { createTargetBinding } from '@/gateway/domain/target-binding';

function makeUseCase(): {
  useCase: MigrateLlmConfigToPoliciesUseCase;
  repo: InMemorySchedulingConfigRepository;
} {
  const repo = new InMemorySchedulingConfigRepository();
  return { useCase: new MigrateLlmConfigToPoliciesUseCase(repo), repo };
}

/**
 * R-c A7 seam (failing-first): idempotent `migrateLlmConfigToPolicies()`
 * maps the legacy `LlmConfig` knobs onto both delivery policies
 * (`dailyCap` → both, `dailyResetUtcHour` → `resetHour` else 0,
 * `randomDelayMin/Max` → window, scalar fallback pins min = max,
 * `targetChannel` → telegram binding chatId, global `publishingEnabled`
 * → every binding's `enabled`).
 */
describe('MigrateLlmConfigToPoliciesUseCase (R-c A7)', () => {
  it('maps dailyCap + resetHour + delay window onto both targets', async () => {
    const { useCase } = makeUseCase();
    const { config } = await useCase.execute(
      {
        dailyCap: 5,
        dailyResetUtcHour: 7,
        randomDelayMinMs: 1_000,
        randomDelayMaxMs: 2_000,
        publishingEnabled: true,
      },
      [],
    );
    for (const target of ['telegram', 'threads'] as const) {
      const policy = config.limitsFor(target);
      expect(policy.dailyCap).toBe(5);
      expect(policy.resetHour).toBe(7);
      expect(policy.delayMinMs).toBe(1_000);
      expect(policy.delayMaxMs).toBe(2_000);
    }
    expect(config.enabled).toBe(true);
  });

  it('seeds resetHour 0 UTC when dailyResetUtcHour is missing (A4)', async () => {
    const { useCase } = makeUseCase();
    const { config } = await useCase.execute({ dailyCap: 5 }, []);
    expect(config.limitsFor('telegram').resetHour).toBe(0);
    expect(config.limitsFor('threads').resetHour).toBe(0);
  });

  it('pins min = max from the legacy scalar when no window is given', async () => {
    const { useCase } = makeUseCase();
    const { config } = await useCase.execute({ publishDelayMs: 9_000 }, []);
    expect(config.limitsFor('telegram').delayMinMs).toBe(9_000);
    expect(config.limitsFor('telegram').delayMaxMs).toBe(9_000);
  });

  it('fans global publishingEnabled out to every binding (global→all-bindings)', async () => {
    const { useCase } = makeUseCase();
    const bindings = [
      createTargetBinding({ target: 'telegram', botId: 'b1', chatId: '@a' }),
      createTargetBinding({ target: 'threads', botId: 'b2', chatId: '@b' }),
    ];
    const off = await useCase.execute({ publishingEnabled: false }, bindings);
    expect(off.bindings.map((b) => b.enabled)).toEqual([false, false]);
    expect(off.config.enabled).toBe(false);
    const on = await useCase.execute({ publishingEnabled: true }, bindings);
    expect(on.bindings.map((b) => b.enabled)).toEqual([true, true]);
  });

  it('points the telegram binding at targetChannel, creating it when missing', async () => {
    const { useCase } = makeUseCase();
    const existing = [
      createTargetBinding({ target: 'telegram', botId: 'b1', chatId: '@old' }),
    ];
    const remapped = await useCase.execute(
      { targetChannel: '@new' },
      existing,
    );
    expect(remapped.bindings[0].chatId).toBe('@new');

    const created = await useCase.execute(
      { targetChannel: '@new', telegramBotId: 'b9' },
      [],
    );
    expect(created.bindings).toHaveLength(1);
    expect(created.bindings[0].target).toBe('telegram');
    expect(created.bindings[0].chatId).toBe('@new');
  });

  it('is idempotent: a second run changes nothing', async () => {
    const { useCase, repo } = makeUseCase();
    const snapshot = {
      dailyCap: 5,
      dailyResetUtcHour: 7,
      randomDelayMinMs: 1_000,
      randomDelayMaxMs: 2_000,
      publishingEnabled: true,
      targetChannel: '@c',
      telegramBotId: 'b1',
    };
    const first = await useCase.execute(snapshot, []);
    const saved = await repo.load();
    const second = await useCase.execute(snapshot, first.bindings);
    expect(second.config.limitsFor('telegram').toSnapshot()).toEqual(
      saved.limitsFor('telegram').toSnapshot(),
    );
    expect(second.config.limitsFor('threads').toSnapshot()).toEqual(
      saved.limitsFor('threads').toSnapshot(),
    );
    expect(second.bindings).toEqual(first.bindings);
  });
});

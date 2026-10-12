import { Injectable } from '@nestjs/common';
import { SchedulingConfig } from '@/scheduling/domain/scheduling-config.entity';
import { SchedulingConfigRepository } from '@/scheduling/domain/ports/scheduling-config.repository';
import {
  createTargetBinding,
  type TargetBinding,
} from '@/gateway/domain/target-binding';

/**
 * Legacy `LlmConfig` pacing knobs (feed-publisher slim leaves these
 * behind; R-c A7). `rejectNonLatin` intentionally stays in the slim
 * config — it is not pacing and is never mapped here. Legacy columns
 * stay read-only @deprecated for one phase.
 */
export interface LlmConfigSnapshot {
  readonly dailyCap?: number;
  readonly dailyResetUtcHour?: number;
  readonly randomDelayMinMs?: number;
  readonly randomDelayMaxMs?: number;
  /** Legacy scalar fallback (A4: pins min = max) when no window given. */
  readonly publishDelayMs?: number;
  /** Global switch (A7: fans out to every binding). */
  readonly publishingEnabled?: boolean;
  /** Legacy destination channel (seeds telegram binding chatId). */
  readonly targetChannel?: string;
  /** Vault bot id used only when the telegram binding must be created. */
  readonly telegramBotId?: string;
}

export interface LlmConfigMigrationResult {
  readonly config: SchedulingConfig;
  readonly bindings: TargetBinding[];
}

/**
 * Idempotent `migrateLlmConfigToPolicies()` (R-c A7 + backfill row
 * `id = 1`): maps the legacy snapshot onto both delivery policies and
 * returns the binding list with the global switch fanned out.
 * Re-running with the same snapshot is a no-op (pure mapping + save).
 */
@Injectable()
export class MigrateLlmConfigToPoliciesUseCase {
  public constructor(
    private readonly configs: SchedulingConfigRepository,
  ) {}

  public async execute(
    snapshot: LlmConfigSnapshot,
    bindings: TargetBinding[],
  ): Promise<LlmConfigMigrationResult> {
    const current = await this.configs.load();
    const patchFor = (policy: {
      delayMinMs: number;
      delayMaxMs: number;
      dailyCap: number;
      resetHour: number;
    }): {
      delayMinMs?: number;
      delayMaxMs?: number;
      dailyCap?: number;
      resetHour?: number;
    } => ({
      ...(snapshot.randomDelayMinMs !== undefined ||
      snapshot.randomDelayMaxMs !== undefined ||
      snapshot.publishDelayMs !== undefined
        ? {
            delayMinMs:
              snapshot.randomDelayMinMs ?? snapshot.publishDelayMs ?? policy.delayMinMs,
            delayMaxMs:
              snapshot.randomDelayMaxMs ?? snapshot.publishDelayMs ?? policy.delayMaxMs,
          }
        : {}),
      ...(snapshot.dailyCap !== undefined ? { dailyCap: snapshot.dailyCap } : {}),
      ...(snapshot.dailyResetUtcHour !== undefined
        ? { resetHour: snapshot.dailyResetUtcHour }
        : {}),
    });
    const telegram = current.limitsFor('telegram');
    const threads = current.limitsFor('threads');
    const next = current.update({
      ...(snapshot.publishingEnabled !== undefined
        ? { enabled: snapshot.publishingEnabled }
        : {}),
      telegram: patchFor(telegram),
      threads: patchFor(threads),
    });
    await this.configs.save(next);
    return {
      config: next,
      bindings: this.migrateBindings(snapshot, bindings),
    };
  }

  private migrateBindings(
    snapshot: LlmConfigSnapshot,
    bindings: TargetBinding[],
  ): TargetBinding[] {
    let result = bindings;
    if (snapshot.publishingEnabled !== undefined) {
      const enabled = snapshot.publishingEnabled;
      result = result.map((binding) =>
        createTargetBinding({ ...binding, enabled }),
      );
    }
    if (snapshot.targetChannel !== undefined) {
      const channel = snapshot.targetChannel;
      const idx = result.findIndex((binding) => binding.target === 'telegram');
      if (idx !== -1) {
        result = result.map((binding, i) =>
          i === idx && binding.target === 'telegram'
            ? createTargetBinding({ ...binding, chatId: channel })
            : binding,
        );
      } else if (snapshot.telegramBotId !== undefined) {
        result = [
          ...result,
          createTargetBinding({
            target: 'telegram',
            botId: snapshot.telegramBotId,
            chatId: channel,
            ...(snapshot.publishingEnabled !== undefined
              ? { enabled: snapshot.publishingEnabled }
              : {}),
          }),
        ];
      }
    }
    return result;
  }
}

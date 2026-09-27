import type { PublishTarget } from '../../template/domain/template-target';
import { PUBLISH_TARGETS } from '../../template/domain/template-target';

export type { PublishTarget };
export { PUBLISH_TARGETS };

/**
 * One delivery target binding (threads-publisher plan Fase 2 todo 10,
 * P38-bis).
 *
 * A template/session addresses N targets (telegram, threads or both)
 * and EACH binding carries its own config: the bot (gateway vault id,
 * never a token), the destination channel, the per-binding pacing
 * (`publishDelayMs`, `dailyCap`, P38) and optional content filters.
 * The config lives on the link, not only on the template — sessions
 * operate those links live.
 *
 * Transport rule: `telegram` sends via the telegram-bots-gateway
 * (vault id only); `threads` enqueues into `apps/threads-publisher`
 * over HTTP. The dispatcher (`TargetDispatcherPort`) owns the choice —
 * callers never touch `src/telegram/` or `src/threads/` directly.
 */
export interface TargetBinding {
  readonly target: PublishTarget;
  readonly botId: string;
  readonly chatId: string;
  readonly publishDelayMs: number | null;
  readonly dailyCap: number | null;
}

export interface TargetBindingInput {
  readonly target: PublishTarget;
  readonly botId: string;
  readonly chatId: string;
  readonly publishDelayMs?: number | null;
  readonly dailyCap?: number | null;
}

export function isTargetKind(value: unknown): value is PublishTarget {
  return value === 'telegram' || value === 'threads';
}

export function createTargetBinding(input: TargetBindingInput): TargetBinding {
  if (!isTargetKind(input.target)) {
    throw new Error(`unknown target: ${String(input.target)}`);
  }
  if (!input.botId.trim()) {
    throw new Error('target binding needs a botId (gateway vault id)');
  }
  if (!input.chatId.trim()) {
    throw new Error('target binding needs a chatId (verified channel)');
  }
  if (
    input.publishDelayMs !== undefined &&
    input.publishDelayMs !== null &&
    (!Number.isInteger(input.publishDelayMs) || input.publishDelayMs < 0)
  ) {
    throw new Error(
      'target binding publishDelayMs must be a non-negative integer',
    );
  }
  if (
    input.dailyCap !== undefined &&
    input.dailyCap !== null &&
    (!Number.isInteger(input.dailyCap) || input.dailyCap < 0)
  ) {
    throw new Error('target binding dailyCap must be a non-negative integer');
  }
  return {
    target: input.target,
    botId: input.botId,
    chatId: input.chatId,
    publishDelayMs: input.publishDelayMs ?? null,
    dailyCap: input.dailyCap ?? null,
  };
}

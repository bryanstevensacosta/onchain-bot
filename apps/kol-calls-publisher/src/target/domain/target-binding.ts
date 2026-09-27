/**
 * Delivery target kinds (threads-publisher plan Fase 2 todo 10,
 * P38-bis per-binding config).
 *
 * `target = bot telegram via gateway OR publisher threads`
 * (per-binding choice): a template/session addresses N targets and
 * EACH binding carries its own config (bot, channel, delay, caps).
 */
export type TargetKind = 'telegram' | 'threads';

export const TARGET_KINDS: ReadonlyArray<TargetKind> = ['telegram', 'threads'];

export interface TargetBinding {
  readonly target: TargetKind;
  readonly botId: string;
  readonly chatId: string;
  readonly publishDelayMs: number | null;
  readonly dailyCap: number | null;
}

export interface TargetBindingInput {
  readonly target: TargetKind;
  readonly botId: string;
  readonly chatId: string;
  readonly publishDelayMs?: number | null;
  readonly dailyCap?: number | null;
}

export function isTargetKind(value: unknown): value is TargetKind {
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

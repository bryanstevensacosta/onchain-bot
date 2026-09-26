import type { SessionRecord } from '../../domain/ports/session-binding.authorizer';
import type { SchedulingTarget } from 'scheduling/domain/scheduling-target';
import { isSchedulingTarget } from 'scheduling/domain/scheduling-target';

/**
 * Seeds the in-memory session registry from
 * `SCHEDULING_SESSION_BINDINGS` JSON
 * (`[{ sessionId, active, bindings: [{ bindingId, target, botId,
 * defaultChatId, botVerified, publishDelayMs, dailyCap }] }]`).
 * Malformed input fails safe to ZERO bindings — schedule calls then
 * 409 NO_ACTIVE_TARGET (dashboard-only mode) instead of inventing
 * ownership.
 */
export function parseSessionBindings(raw: string): SessionRecord[] {
  if (!raw || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const rows: SessionRecord[] = [];
    for (const entry of parsed) {
      if (!isRecord(entry) || typeof entry.sessionId !== 'string') continue;
      const bindings: SessionRecord['bindings'] = [];
      if (Array.isArray(entry.bindings)) {
        for (const binding of entry.bindings) {
          if (!isRecord(binding)) continue;
          const { bindingId, target, botId, defaultChatId } = binding;
          if (
            typeof bindingId !== 'string' ||
            typeof target !== 'string' ||
            !isSchedulingTarget(target) ||
            typeof botId !== 'string' ||
            typeof defaultChatId !== 'string'
          ) {
            continue;
          }
          bindings.push({
            bindingId,
            target: target as SchedulingTarget,
            botId,
            defaultChatId,
            botVerified: binding.botVerified === true,
            publishDelayMs: toNonNegativeInt(binding.publishDelayMs),
            dailyCap: toNonNegativeInt(binding.dailyCap),
          });
        }
      }
      rows.push({
        sessionId: entry.sessionId,
        active: entry.active !== false,
        bindings,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNonNegativeInt(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : 0;
}

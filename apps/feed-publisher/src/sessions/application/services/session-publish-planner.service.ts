import { Injectable } from '@nestjs/common';
import { DeduplicationService } from '../../../deduplication/application/services/deduplication.service';
import { TemplateBotRepository } from '../../../template/domain/ports/template-bot.repository';
import type { PublishTarget } from '../../../template/domain/template-target';
import { PUBLISH_TARGETS } from '../../../template/domain/template-target';
import { PublishingSessionRepository } from '../../domain/ports/publishing-session.repository';
import type { SessionPublishPlan } from '../ports/session-publisher.port';

export interface SessionIncomingMessage {
  readonly channelId: string;
  readonly messageId: number;
  readonly content: string;
  readonly sourceId: string;
  readonly keywordId?: string;
}

export interface SessionPlannerLimits {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

interface PacingState {
  lastPublishedAtMs: number;
  dayKey: string;
  count: number;
}

function utcDayKey(at: Date): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Session publish planner (Tramo 2, todo 12, P34 + P38).
 *
 * Fans one incoming feed message out to every eligible session:
 * inactive sessions and sessions with matching off consume nothing;
 * source toggles off, keyword misses, and unpublished schedules skip
 * silently. Deduplication is GLOBAL and shared: a single probe per
 * message blocks ALL sessions on a repeat (no per-session dedup
 * state). Per-target pacing (P38) is enforced per (session, target)
 * from the session schedule overrides, falling back to the injected
 * global limits: delay-not-met and cap-reached HOLD the plan (never
 * drop, never burn). Unknown catalog bots skip THAT target only.
 */
@Injectable()
export class SessionPublishPlanner {
  private readonly pacing = new Map<string, PacingState>();

  public constructor(
    private readonly sessions: PublishingSessionRepository,
    private readonly bots: TemplateBotRepository,
    private readonly deduplication: DeduplicationService,
  ) {}

  public async planForMessage(
    message: SessionIncomingMessage,
    globalLimits: Record<PublishTarget, SessionPlannerLimits>,
    now: Date = new Date(),
  ): Promise<ReadonlyArray<SessionPublishPlan>> {
    const all = await this.sessions.list();
    const consumers = all.filter(
      (session) =>
        session.canConsume() &&
        session.isSourceOn(message.sourceId) &&
        (message.keywordId === undefined ||
          session.isKeywordEligible(message.keywordId)) &&
        this.isScheduleOpen(session.schedule, now),
    );
    if (consumers.length === 0) return [];
    const duplicate = await this.deduplication.checkDuplicate({
      source: 'sessions',
      channelId: message.channelId,
      messageId: message.messageId,
      content: message.content,
    });
    if (duplicate.isDuplicate) return [];
    const plans: SessionPublishPlan[] = [];
    for (const session of consumers) {
      if (!session.canPublish()) continue;
      for (const target of PUBLISH_TARGETS) {
        const bindings = session.targetsFor(target);
        if (bindings.length === 0) continue;
        const limits = this.limitsFor(session.schedule, target, globalLimits);
        if (!this.pacingAllows(session.id, target, limits, now)) continue;
        for (const binding of bindings) {
          const bot = await this.bots.findById(binding.botId);
          if (!bot) continue;
          plans.push({
            sessionId: session.id,
            target,
            botId: binding.botId,
            chatId: binding.chatId,
            mode: session.renderMode(),
            content: message.content,
          });
        }
        if (bindings.length > 0) {
          this.markPublished(session.id, target, now);
        }
      }
    }
    if (plans.length > 0) {
      await this.deduplication.markAsSeen({
        source: 'sessions',
        channelId: message.channelId,
        messageId: message.messageId,
        content: message.content,
      });
    }
    return plans;
  }

  private isScheduleOpen(
    schedule: { enabled: boolean; oneShotAt: Date | null },
    now: Date,
  ): boolean {
    if (!schedule.enabled) return false;
    if (
      schedule.oneShotAt !== null &&
      now.getTime() < schedule.oneShotAt.getTime()
    ) {
      return false;
    }
    return true;
  }

  private limitsFor(
    schedule: {
      telegram: { publishDelayMs: number; dailyCap: number } | null;
      threads: { publishDelayMs: number; dailyCap: number } | null;
    },
    target: PublishTarget,
    globalLimits: Record<PublishTarget, SessionPlannerLimits>,
  ): SessionPlannerLimits {
    return schedule[target] ?? globalLimits[target];
  }

  private pacingAllows(
    sessionId: string,
    target: PublishTarget,
    limits: SessionPlannerLimits,
    now: Date,
  ): boolean {
    const key = `${sessionId}:${target}`;
    const state = this.pacing.get(key);
    if (!state) return limits.dailyCap > 0;
    if (limits.dailyCap <= 0) return false;
    if (state.dayKey !== utcDayKey(now)) return true;
    if (state.count >= limits.dailyCap) return false;
    return now.getTime() - state.lastPublishedAtMs >= limits.publishDelayMs;
  }

  private markPublished(
    sessionId: string,
    target: PublishTarget,
    now: Date,
  ): void {
    const key = `${sessionId}:${target}`;
    const dayKey = utcDayKey(now);
    const previous = this.pacing.get(key);
    this.pacing.set(key, {
      lastPublishedAtMs: now.getTime(),
      dayKey,
      count:
        previous !== undefined && previous.dayKey === dayKey
          ? previous.count + 1
          : 1,
    });
  }
}

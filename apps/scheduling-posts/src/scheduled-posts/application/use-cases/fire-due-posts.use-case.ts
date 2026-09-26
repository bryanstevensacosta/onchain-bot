import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ScheduledPost } from '../../domain/scheduled-post.entity';
import { CronDueChecker } from '../../domain/cron-due.checker';
import type { ScheduleResultCallback } from '../../domain/schedule-request';
import { ScheduledPostRepository } from '../../domain/ports/scheduled-post.repository';
import {
  SessionBindingAuthorizer,
  type VerifiedBinding,
} from '../../domain/ports/session-binding.authorizer';
import { ContentRefResolver } from '../../domain/ports/content-ref.resolver';
import { ScheduleResultCallbackPort } from '../../domain/ports/schedule-result-callback.port';
import { SchedulingConfigRepository } from 'scheduling/domain/ports/scheduling-config.repository';
import { SchedulingStateRepository } from 'scheduling/domain/ports/scheduling-state.repository';
import { AdMediaLibraryRepository } from 'scheduling/domain/ports/ad-media-library.repository';
import type { SchedulingTarget } from 'scheduling/domain/scheduling-target';
import { SchedulingGatewayDispatcher } from 'telegram/application/dispatch/scheduling-gateway.dispatcher';

export type FireHoldReason = 'HELD_DELAY' | 'HELD_DAILY_CAP';

/**
 * Contract §§3+6 fire path (scheduler enforces, P38).
 *
 * Per tick: session liveness → fire-time ownership re-check
 * (revocation between schedule and fire → failed, never publish) →
 * due check (once fireAt / cron UTC minute) → per-target delay/cap
 * HOLD (never drop; sibling target unaffected) → content resolution
 * → gateway-only dispatch → fired/failed/stays + exactly one
 * terminal callback. Fail-safe default: gateway-down stays
 * `scheduled` (TARGET_DOWN transient — no messageId = no fired).
 * Retries are NEW requests with NEW keys; `publish-now` bypasses the
 * decider but still enforces auth + emits the same callback.
 */
@Injectable()
export class FireDuePostsUseCase {
  private readonly mediaPublicBaseUrl: string;

  public constructor(
    private readonly posts: ScheduledPostRepository,
    private readonly sessions: SessionBindingAuthorizer,
    private readonly refs: ContentRefResolver,
    private readonly configs: SchedulingConfigRepository,
    private readonly states: SchedulingStateRepository,
    private readonly library: AdMediaLibraryRepository,
    private readonly dispatcher: SchedulingGatewayDispatcher,
    private readonly callbacks: ScheduleResultCallbackPort,
    @Optional() config?: ConfigService,
  ) {
    this.mediaPublicBaseUrl = (
      config?.get<string>('SCHEDULING_MEDIA_PUBLIC_BASE_URL', '') ?? ''
    ).trim();
  }

  /** Cron tick: fire every due `scheduled` post. Returns the fired posts. */
  public async fireDue(now: Date): Promise<ScheduledPost[]> {
    const fired: ScheduledPost[] = [];
    const pending = await this.posts.findScheduled();
    for (const post of pending) {
      const result = await this.tryFire(post, now, false);
      if (result) fired.push(result);
    }
    return fired;
  }

  /** Manual fire: bypasses the delay/cap decider, enforces auth, same callback. */
  public async publishNow(postId: string, sessionId: string): Promise<ScheduledPost> {
    const post = await this.posts.findById(postId);
    if (!post) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown scheduled post ${postId}`);
    }
    if (post.state !== 'scheduled') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `cannot publish-now post ${postId}: terminal state ${post.state}`,
      );
    }
    if (post.sessionId !== sessionId) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `scheduled post ${postId} owner mismatch: session ${sessionId} is not the owning session`,
      );
    }
    const fired = await this.tryFire(post, new Date(), true);
    if (!fired) {
      const after = await this.posts.findById(postId);
      throw new DomainError(
        ErrorCode.PUBLISH_FAILED,
        `publish-now held or failed for post ${postId} (state ${after?.state})`,
      );
    }
    return fired;
  }

  private async tryFire(
    post: ScheduledPost,
    now: Date,
    bypassDecider: boolean,
  ): Promise<ScheduledPost | null> {
    const session = await this.sessions.findSession(post.sessionId);
    if (!session || !session.active) {
      return this.terminal(post, post.cancel(post.sessionId, 'SESSION_CLOSED'));
    }
    const binding = session.bindings.find(
      (candidate) =>
        candidate.bindingId === post.binding.bindingId &&
        candidate.target === post.binding.target &&
        candidate.botId === post.binding.botId,
    );
    if (!binding || !binding.botVerified) {
      return this.terminal(post, post.markFailed('BOT_REVOKED'));
    }
    if (binding.defaultChatId !== post.binding.chatId) {
      return this.terminal(post, post.markFailed('CHANNEL_MISMATCH'));
    }
    if (!bypassDecider && !this.isDue(post, now)) {
      return null;
    }
    if (!bypassDecider) {
      const hold = await this.holdReason(post.binding.target, binding, now);
      if (hold) {
        return null;
      }
    }
    const resolved = await this.resolveContent(post);
    if (!resolved.ok) {
      return this.terminal(post, post.markFailed(resolved.reason));
    }
    const sent = await this.dispatcher.publishScheduledPost({
      postId: post.id,
      botId: post.binding.botId,
      chatId: post.binding.chatId,
      text: resolved.text,
      ...(resolved.photoUrl ? { photoUrl: resolved.photoUrl } : {}),
      ...(resolved.media ? { media: resolved.media } : {}),
      clientMsgId: post.id,
    });
    if (!sent.ok || sent.messageId === null) {
      return null;
    }
    const firedAt = now.toISOString();
    const state = await this.states.load();
    await this.states.save(state.markPublished(post.binding.target, post.id, now));
    if (post.scheduleKind.kind === 'once') {
      return this.terminal(post, post.markFired(sent.messageId, firedAt));
    }
    const recurred = post.recordRecurringFire(firedAt, sent.messageId);
    const saved = await this.posts.save(recurred);
    await this.emit({
      scheduledPostId: post.id,
      sessionId: post.sessionId,
      bindingId: post.binding.bindingId,
      target: post.binding.target,
      state: 'fired',
      messageId: String(sent.messageId),
      firedAt,
      reason: null,
      idempotencyKey: post.idempotencyKey,
    });
    return saved;
  }

  private isDue(post: ScheduledPost, now: Date): boolean {
    const kind = post.scheduleKind;
    if (kind.kind === 'once') {
      return new Date(kind.fireAt).getTime() <= now.getTime();
    }
    if (!CronDueChecker.isDue(kind.cronExpr, now)) {
      return false;
    }
    const last = post.toSnapshot().lastFiredAt;
    if (!last) return true;
    const prev = new Date(last);
    return (
      prev.getUTCFullYear() !== now.getUTCFullYear() ||
      prev.getUTCMonth() !== now.getUTCMonth() ||
      prev.getUTCDate() !== now.getUTCDate() ||
      prev.getUTCHours() !== now.getUTCHours() ||
      prev.getUTCMinutes() !== now.getUTCMinutes()
    );
  }

  /**
   * P38 enforcement: the session proposes per-binding delay/cap; the
   * scheduler row is the global floor (sessions can only tighten, and
   * `dailyCap: 0` on the binding pauses that binding outright).
   */
  private async holdReason(
    target: SchedulingTarget,
    binding: VerifiedBinding,
    now: Date,
  ): Promise<FireHoldReason | null> {
    const config = await this.configs.load();
    const row = config.limitsFor(target);
    const delayMs = Math.max(binding.publishDelayMs, row.publishDelayMs);
    if (binding.dailyCap === 0) {
      return 'HELD_DAILY_CAP';
    }
    const cap = Math.min(binding.dailyCap, row.dailyCap);
    const state = await this.states.load();
    if (state.publishedTodayFor(target, now) >= cap) {
      return 'HELD_DAILY_CAP';
    }
    const cursor = state.cursorFor(target);
    if (cursor.lastPublishedAt) {
      const elapsed = now.getTime() - new Date(cursor.lastPublishedAt).getTime();
      if (elapsed < delayMs) {
        return 'HELD_DELAY';
      }
    }
    return null;
  }

  private async resolveContent(
    post: ScheduledPost,
  ): Promise<
    | { ok: true; text: string; photoUrl?: string; media?: ReadonlyArray<Record<string, unknown>> }
    | { ok: false; reason: 'MEDIA_MISSING' | 'CONTENT_REF_GONE' }
  > {
    const content = post.content;
    if (content.kind === 'content-ref') {
      const resolved = await this.refs.resolve(content.queueEntryId);
      if (!resolved) {
        return { ok: false, reason: 'CONTENT_REF_GONE' };
      }
      return this.resolveMedia(resolved.text, resolved.mediaIds);
    }
    return this.resolveMedia(content.text, content.mediaIds ?? []);
  }

  private async resolveMedia(
    text: string,
    mediaIds: ReadonlyArray<string>,
  ): Promise<
    | { ok: true; text: string; photoUrl?: string; media?: ReadonlyArray<Record<string, unknown>> }
    | { ok: false; reason: 'MEDIA_MISSING' }
  > {
    if (mediaIds.length === 0) {
      return { ok: true, text };
    }
    if (!this.mediaPublicBaseUrl) {
      return { ok: false, reason: 'MEDIA_MISSING' };
    }
    const urls: string[] = [];
    for (const mediaId of mediaIds) {
      const entry = await this.library.findById(mediaId);
      const mime = entry?.mimeType ?? '';
      if (!entry || (!mime.startsWith('image/') && mime !== '')) {
        return { ok: false, reason: 'MEDIA_MISSING' };
      }
      urls.push(
        `${this.mediaPublicBaseUrl.replace(/\/+$/, '')}/api/scheduling/media/library/${mediaId}`,
      );
    }
    if (urls.length === 1) {
      return { ok: true, text, photoUrl: urls[0] };
    }
    return {
      ok: true,
      text,
      media: urls.map((url) => ({ type: 'photo', media: url })),
    };
  }

  private async terminal(
    post: ScheduledPost,
    next: ScheduledPost,
  ): Promise<ScheduledPost> {
    const saved = await this.posts.save(next);
    const state = next.state;
    if (state !== 'scheduled') {
      await this.emit({
        scheduledPostId: post.id,
        sessionId: post.sessionId,
        bindingId: post.binding.bindingId,
        target: post.binding.target,
        state,
        messageId: next.messageId === null ? null : String(next.messageId),
        firedAt: next.firedAt,
        reason: next.reason,
        idempotencyKey: post.idempotencyKey,
      });
    }
    return saved;
  }

  private async emit(callback: ScheduleResultCallback): Promise<void> {
    try {
      await this.callbacks.emit(callback);
    } catch {
      return;
    }
  }
}

export type { VerifiedBinding };

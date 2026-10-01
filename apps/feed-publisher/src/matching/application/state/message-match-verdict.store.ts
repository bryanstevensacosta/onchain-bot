import { Injectable } from '@nestjs/common';
import type {
  BlacklistHitView,
  KeywordHitView,
} from '@/matching/api/http/message-match.views';

export interface PersistedMatchVerdict {
  readonly channelId: string;
  readonly messageId: number;
  readonly matched: boolean;
  readonly blocked: boolean;
  readonly matchedKeywords: ReadonlyArray<KeywordHitView>;
  readonly blockedBy: ReadonlyArray<BlacklistHitView>;
  readonly filteredTitle: string | null;
  readonly filteredContent: string;
  readonly evaluatedAt: string;
}

/**
 * In-memory home for the otherwise ephemeral match verdict (todo 17).
 *
 * `MessageMatchResult` lives only in memory during the cron tick and the
 * queue persists only `matchedKeywordIds`/`blockedReason` on enqueue, so
 * a per-message status read re-evaluates live rules and parks the verdict
 * here: later reads survive the feed window sliding past the message.
 * Bounded (1000 entries, 24h TTL) — queue rows stay the source of truth
 * for anything enqueued.
 */
@Injectable()
export class MessageMatchVerdictStore {
  private readonly verdicts = new Map<
    string,
    { verdict: PersistedMatchVerdict; insertedAt: number }
  >();
  private readonly MAX_ENTRIES = 1000;
  private readonly TTL_MS = 24 * 60 * 60 * 1000;

  public save(verdict: PersistedMatchVerdict): void {
    const now = Date.now();
    this.evictExpired(now);
    if (this.verdicts.size >= this.MAX_ENTRIES) {
      const oldest = this.verdicts.keys().next();
      if (!oldest.done) {
        this.verdicts.delete(oldest.value);
      }
    }
    this.verdicts.set(this.key(verdict.channelId, verdict.messageId), {
      verdict,
      insertedAt: now,
    });
  }

  public find(
    channelId: string,
    messageId: number,
  ): PersistedMatchVerdict | null {
    const held = this.verdicts.get(this.key(channelId, messageId));
    if (!held) {
      return null;
    }
    if (Date.now() - held.insertedAt > this.TTL_MS) {
      this.verdicts.delete(this.key(channelId, messageId));
      return null;
    }
    return held.verdict;
  }

  private key(channelId: string, messageId: number): string {
    return `${channelId}:${messageId}`;
  }

  private evictExpired(now: number): void {
    for (const [key, held] of this.verdicts) {
      if (now - held.insertedAt > this.TTL_MS) {
        this.verdicts.delete(key);
      }
    }
  }
}

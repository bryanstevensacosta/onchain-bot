import { Injectable } from '@nestjs/common';
import { FeedPort } from '@/matching/domain/ports/feed.port';
import { QueueManager } from '@/queue/application/services/queue-manager.service';
import { EvaluateMessageMatchUseCase } from './evaluate-message-match.use-case';
import { KeywordRepository } from '@/keywords/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '@/keywords/application/ports/blacklist-phrase.repository';
import { MessageMatchVerdictStore } from '../state/message-match-verdict.store';
import type {
  BlacklistHitView,
  KeywordHitView,
  MessageBadge,
  MessageStatusView,
  QueueStatusView,
} from '@/matching/api/http/message-match.views';

/**
 * Human-readable verdict lines for the feed UX (shared by the status and
 * dry-run endpoints so both explain the same outcome the same way).
 */
export function buildMatchReasons(input: {
  matched: boolean;
  blocked: boolean;
  matchedKeywords: ReadonlyArray<KeywordHitView>;
  blockedBy: ReadonlyArray<BlacklistHitView>;
}): string[] {
  const reasons: string[] = [];
  if (input.blocked) {
    for (const hit of input.blockedBy) {
      reasons.push(`blocked by blacklist phrase "${hit.phrase}"`);
    }
  }
  if (input.matched) {
    for (const hit of input.matchedKeywords) {
      reasons.push(`matched keyword "${hit.phrase}"`);
    }
  }
  if (!input.matched && !input.blocked) {
    reasons.push('no keyword matched');
  }
  return reasons;
}

/**
 * Per-message lifecycle status (todo 17): joins the live match verdict
 * (re-evaluated against current rules, parked in the verdict store) with
 * the persisted queue row (status plus blocked/failed reasons).
 *
 * Fail-open on the feed: when the ingestion read fails or the message
 * slid out of the recent window, the verdict falls back to the stored
 * verdict and then to the queue snapshot — the queue row stays the
 * source of truth for anything enqueued.
 */
@Injectable()
export class MessageMatchStatusUseCase {
  private readonly STATUS_FETCH_LIMIT = 200;

  public constructor(
    private readonly feed: FeedPort,
    private readonly queue: QueueManager,
    private readonly dryRun: EvaluateMessageMatchUseCase,
    private readonly keywords: KeywordRepository,
    private readonly blacklist: BlacklistPhraseRepository,
    private readonly verdicts: MessageMatchVerdictStore,
  ) {}

  public async getStatus(
    channelId: string,
    messageId: number,
  ): Promise<MessageStatusView> {
    const entry = await this.queue.findTracked(channelId, messageId);
    const queueView: QueueStatusView | null = entry
      ? {
          status: entry.status,
          attempts: entry.attempts,
          blockedReason: entry.blockedReason,
          lastError: entry.lastError,
          telegramMessageId: entry.telegramMessageId,
        }
      : null;

    let ingested = false;
    let evaluated = false;
    let matched = false;
    let blocked = false;
    let hits: KeywordHitView[] = [];
    let blocks: BlacklistHitView[] = [];
    let filteredTitle: string | null = null;
    let filteredContent: string | null = null;
    let rawTitle: string | null = null;
    let rawContent: string | null = null;

    const rows = await this.fetchFeedRows(channelId);
    const raw = rows.find((r) => r.messageId === messageId) ?? null;
    if (raw) {
      ingested = true;
      evaluated = true;
      rawTitle = raw.title;
      rawContent = raw.content;
      const verdict = await this.dryRun.execute({
        channelId,
        messageId,
        title: raw.title,
        content: raw.content,
        hasMedia: raw.media.some(
          (m) => m.type === 'photo' || m.type === 'video',
        ),
      });
      const enriched = await this.enrich(
        verdict.matchedKeywordIds,
        verdict.blockedByIds,
      );
      matched = verdict.matched;
      blocked = verdict.blocked;
      hits = enriched.hits;
      blocks = enriched.blocks;
      filteredTitle = verdict.filteredTitle;
      filteredContent = verdict.filteredContent;
      this.verdicts.save({
        channelId,
        messageId,
        matched,
        blocked,
        matchedKeywords: hits,
        blockedBy: blocks,
        filteredTitle,
        filteredContent,
        evaluatedAt: new Date().toISOString(),
      });
    } else {
      const stored = this.verdicts.find(channelId, messageId);
      if (stored) {
        evaluated = true;
        matched = stored.matched;
        blocked = stored.blocked;
        hits = [...stored.matchedKeywords];
        blocks = [...stored.blockedBy];
        filteredTitle = stored.filteredTitle;
        filteredContent = stored.filteredContent;
      } else if (entry && entry.matchedKeywordIds.length > 0) {
        const enriched = await this.enrich([...entry.matchedKeywordIds], []);
        matched = true;
        evaluated = true;
        hits = enriched.hits;
        filteredTitle = entry.rawTitle;
        filteredContent = entry.rawContent;
      }
    }

    const reasons = evaluated
      ? buildMatchReasons({
          matched,
          blocked,
          matchedKeywords: hits,
          blockedBy: blocks,
        })
      : [];
    if (!ingested && !entry) {
      reasons.push('message not in recent feed window and not queued');
    }
    if (!ingested && entry) {
      reasons.push('message slid out of the recent feed window');
    }
    if (entry) {
      reasons.push(`queue status ${entry.status}`);
      if (entry.status === 'BLOCKED' && entry.blockedReason) {
        reasons.push(`blocked: ${entry.blockedReason}`);
      }
      if (entry.status === 'FAILED' && entry.lastError) {
        reasons.push(`failed: ${entry.lastError}`);
      }
      if (entry.status === 'PUBLISHED' && entry.telegramMessageId) {
        reasons.push(
          `published as telegram message ${entry.telegramMessageId}`,
        );
      }
    } else {
      reasons.push('not in queue');
    }

    return {
      channelId,
      messageId,
      ingested,
      matched,
      blocked,
      matchedKeywords: hits,
      blockedBy: blocks,
      reasons,
      filteredTitle,
      filteredContent,
      rawTitle,
      rawContent,
      queue: queueView,
      badge: this.badge({
        matched,
        blocked,
        ingested,
        hits,
        blocks,
        entryStatus: entry?.status ?? null,
        blockedReason: entry?.blockedReason ?? null,
      }),
    };
  }

  private badge(input: {
    matched: boolean;
    blocked: boolean;
    ingested: boolean;
    hits: ReadonlyArray<KeywordHitView>;
    blocks: ReadonlyArray<BlacklistHitView>;
    entryStatus: string | null;
    blockedReason: string | null;
  }): MessageBadge {
    if (input.entryStatus === 'PUBLISHED') {
      return 'Published';
    }
    if (input.entryStatus === 'BLOCKED') {
      return `Blocked by ${input.blockedReason ?? 'duplicate'}`;
    }
    if (input.entryStatus === 'FAILED') {
      return 'Failed';
    }
    if (input.entryStatus !== null) {
      return 'Pending to publish';
    }
    if (input.blocked) {
      const phrases = input.blocks.map((b) => `"${b.phrase}"`).join(', ');
      return `Blocked by ${phrases || 'blacklist'}`;
    }
    if (input.matched) {
      return 'Pending to publish';
    }
    void input.hits;
    return input.ingested ? 'Not matched' : 'Not found';
  }

  private async fetchFeedRows(channelId: string) {
    try {
      return await this.feed.fetchRecentMessages(
        this.STATUS_FETCH_LIMIT,
        channelId,
      );
    } catch {
      return [];
    }
  }

  private async enrich(
    matchedKeywordIds: ReadonlyArray<string>,
    blockedByIds: ReadonlyArray<string>,
  ): Promise<{ hits: KeywordHitView[]; blocks: BlacklistHitView[] }> {
    const [keywords, blacklist] = await Promise.all([
      this.keywords.findAll(),
      this.blacklist.findAll(),
    ]);
    const hits = matchedKeywordIds.map((id) => ({
      id,
      phrase: keywords.find((k) => k.id === id)?.phrase ?? '<removed>',
    }));
    const blocks = blockedByIds.map((id) => ({
      id,
      phrase: blacklist.find((p) => p.id === id)?.phrase ?? '<removed>',
    }));
    return { hits, blocks };
  }
}

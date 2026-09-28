/**
 * Shared HTTP views for per-message match state (todos 17/18).
 *
 * Badge contract for the feed UX: `Not matched` (ingested, no keyword),
 * `Pending to publish` (matched, not yet queued), `Blocked by ...`
 * (blacklist block with the phrase, or queue dedup with the stored
 * reason), `Published` (terminal with a telegram id), `Failed` (terminal
 * with `lastError`), `Not found` (outside the feed window, never queued).
 */
export interface KeywordHitView {
  readonly id: string;
  readonly phrase: string;
}

export interface BlacklistHitView {
  readonly id: string;
  readonly phrase: string;
}

export type MessageBadge =
  | 'Not matched'
  | 'Pending to publish'
  | 'Published'
  | 'Failed'
  | 'Not found'
  | `Blocked by ${string}`;

export interface QueueStatusView {
  readonly status: string;
  readonly attempts: number;
  readonly blockedReason: string | null;
  readonly lastError: string | null;
  readonly telegramMessageId: string | null;
}

export interface MessageStatusView {
  readonly channelId: string;
  readonly messageId: number;
  readonly ingested: boolean;
  readonly matched: boolean;
  readonly blocked: boolean;
  readonly matchedKeywords: ReadonlyArray<KeywordHitView>;
  readonly blockedBy: ReadonlyArray<BlacklistHitView>;
  readonly reasons: ReadonlyArray<string>;
  readonly filteredTitle: string | null;
  readonly filteredContent: string | null;
  readonly rawTitle: string | null;
  readonly rawContent: string | null;
  readonly queue: QueueStatusView | null;
  readonly badge: MessageBadge;
}

export interface DryRunView {
  readonly matched: boolean;
  readonly blocked: boolean;
  readonly filteredTitle: string | null;
  readonly filteredContent: string;
  readonly matchedKeywords: ReadonlyArray<KeywordHitView>;
  readonly blockedBy: ReadonlyArray<BlacklistHitView>;
  readonly hasMedia: boolean;
  readonly reasons: ReadonlyArray<string>;
  readonly filtersApplied: number;
}

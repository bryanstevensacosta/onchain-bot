import type { MessageBadge } from '../api/feed-session-queries';

/**
 * Lowercase-dash slug rule (dedup-friendly): mirrors the backend
 * `slugify` (feed-publisher sessions entity) so client-generated ids
 * match server-generated ones.
 *
 * History: `PROFILE_NAME_RE` / `normalizeProfileName` /
 * `isValidProfileName` — kept as `@deprecated` aliases below.
 */
export const FEED_SESSION_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeFeedSessionName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidFeedSessionName(name: string): boolean {
  return FEED_SESSION_NAME_RE.test(name);
}

type BadgeTone =
  | 'green'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'red'
  | 'blue'
  | 'gray'
  | 'cyan'
  | 'white';

export function badgeTone(badge: MessageBadge | string): BadgeTone {
  if (badge === 'Published') return 'green';
  if (badge === 'Pending to publish') return 'blue';
  if (badge === 'Failed') return 'red';
  if (badge.startsWith('Blocked by')) return 'amber';
  return 'gray';
}

export interface Paginated<T> {
  readonly pageItems: ReadonlyArray<T>;
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
}

export function paginate<T>(
  items: ReadonlyArray<T>,
  page: number,
  pageSize: number,
): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}

export interface KeywordRow {
  readonly id: string;
  readonly phrase: string;
  readonly andGroupId: string | null;
}

export interface CompoundGroup<T extends KeywordRow> {
  readonly groupId: string;
  readonly rows: ReadonlyArray<T>;
}

export function splitKeywordGroups<T extends KeywordRow>(
  rows: ReadonlyArray<T>,
): { single: ReadonlyArray<T>; compound: ReadonlyArray<CompoundGroup<T>> } {
  const single: T[] = [];
  const byGroup = new Map<string, T[]>();
  for (const row of rows) {
    if (row.andGroupId === null) {
      single.push(row);
    } else {
      const group = byGroup.get(row.andGroupId) ?? [];
      group.push(row);
      byGroup.set(row.andGroupId, group);
    }
  }
  return {
    single,
    compound: [...byGroup.entries()].map(([groupId, groupRows]) => ({
      groupId,
      rows: groupRows,
    })),
  };
}

export type PublishTargetKind = 'telegram' | 'threads';

export interface SessionTargetRef {
  readonly botId: string;
  readonly chatId: string;
}

export interface SessionSnapshotSource {
  readonly templateId: string | null;
  readonly active: boolean;
  readonly matchingEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly keywordIds: ReadonlyArray<string>;
  readonly sourceToggles: Record<string, boolean>;
  readonly telegramTargets: ReadonlyArray<SessionTargetRef>;
  readonly threadsTargets: ReadonlyArray<SessionTargetRef>;
}

export interface SessionTemplateSnapshot {
  readonly sourceIds: ReadonlyArray<string>;
  readonly keywordIds: ReadonlyArray<string>;
  readonly promptTemplateId: string | null;
  readonly targets: ReadonlyArray<PublishTargetKind>;
  readonly botBindings: ReadonlyArray<
    SessionTargetRef & { readonly target: PublishTargetKind }
  >;
  readonly matchingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
}

/**
 * Template save contract (P34-ter): a template stores everything from a
 * session EXCEPT the session name and its targets. Targets are derived
 * (which kinds are bound + their bot bindings) so loading a template
 * never renames the session nor rebinds its bots — only the operator
 * edits those in the Target tab.
 */
export function snapshotSessionToTemplate(
  session: SessionSnapshotSource,
): SessionTemplateSnapshot {
  const sourceIds = Object.entries(session.sourceToggles)
    .filter(([, on]) => on)
    .map(([channelId]) => channelId);
  const targets: PublishTargetKind[] = [
    ...(session.telegramTargets.length > 0 ? ['telegram' as const] : []),
    ...(session.threadsTargets.length > 0 ? ['threads' as const] : []),
  ];
  return {
    sourceIds,
    keywordIds: [...session.keywordIds],
    promptTemplateId: null,
    targets,
    botBindings: [
      ...session.telegramTargets.map((t) => ({
        ...t,
        target: 'telegram' as const,
      })),
      ...session.threadsTargets.map((t) => ({
        ...t,
        target: 'threads' as const,
      })),
    ],
    matchingEnabled: session.matchingEnabled,
    llmEnabled: session.llmEnabled,
    publishingEnabled: session.publishingEnabled,
  };
}

/**
 * @deprecated Renamed to `FEED_SESSION_NAME_RE`. Kept as alias during transition.
 */
export const PROFILE_NAME_RE = FEED_SESSION_NAME_RE;
/**
 * @deprecated Renamed to `normalizeFeedSessionName`. Kept as alias during transition.
 */
export const normalizeProfileName = normalizeFeedSessionName;
/**
 * @deprecated Renamed to `isValidFeedSessionName`. Kept as alias during transition.
 */
export const isValidProfileName = isValidFeedSessionName;

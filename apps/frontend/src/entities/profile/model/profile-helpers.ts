import type { MessageBadge } from '../api/profile-queries';

/**
 * Lowercase-dash slug rule (dedup-friendly): mirrors the backend
 * `slugify` (feed-publisher sessions entity) so client-generated ids
 * match server-generated ones.
 */
export const PROFILE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeProfileName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidProfileName(name: string): boolean {
  return PROFILE_NAME_RE.test(name);
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

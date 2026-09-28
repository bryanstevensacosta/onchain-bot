import { useCallback, useState } from 'react';

export const RECENT_SCANS_KEY = 'dexter:recent-scans:v1';
export const MAX_RECENT_SCANS = 10;

export function normalizeScanQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function dedupScanQueries(queries: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const key = normalizeScanQuery(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q.trim().replace(/\s+/g, ' '));
    if (out.length >= MAX_RECENT_SCANS) break;
  }
  return out;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadRecentScans(storage?: StorageLike | null): string[] {
  const store = storage ?? safeStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(RECENT_SCANS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupScanQueries(parsed.filter((v) => typeof v === 'string'));
  } catch {
    return [];
  }
}

export function useRecentScans() {
  const [recent, setRecent] = useState<string[]>(() => loadRecentScans());

  const addRecent = useCallback((raw: string) => {
    const display = raw.trim().replace(/\s+/g, ' ');
    if (!display) return;
    setRecent((prev) => {
      const next = dedupScanQueries([display, ...prev]);
      try {
        safeStorage()?.setItem(RECENT_SCANS_KEY, JSON.stringify(next));
      } catch {
        // localStorage full or unavailable — keep in-memory state only.
      }
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    try {
      safeStorage()?.removeItem(RECENT_SCANS_KEY);
    } catch {
      // Ignore persistence failures on clear.
    }
  }, []);

  return { recent, addRecent, clearRecent };
}

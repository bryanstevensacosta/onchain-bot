# Plan: Consolidar `/live` en `/tokens`

> Status: draft → ready for executor  
> Author: Prometheus

## Goal

Eliminar `/live`, hacer que `/tokens` sea la única página de tokens con:
1. Timestamp relativo por token ("hace 30s", "hace 1h")
2. Paginación: 10 tokens por página
3. Orden: más reciente primero (ya funciona por `decidedAt` DESC)

## Files

| File | Action |
|---|---|
| `apps/frontend/src/pages/tokens-explorer/index.tsx` | Paginación + timestamp |
| `apps/frontend/src/app/router/routes.tsx` | Remover `/live` |
| `apps/frontend/src/pages/live-feed/index.tsx` | Eliminar |

## Implementation

### 1. `tokens-explorer/index.tsx`

**Imports** — add:
```tsx
import { formatRelativeTime, usePagination } from '@/shared/lib';
```

**Fetch more** — change limits from 50 to 100 (para paginar):
```tsx
const { data: allData, isLoading: allLoading } = useRecentDecisions(100);
const { data: approvedData, isLoading: approvedLoading } = useApproved(100);
const { data: rejectedData, isLoading: rejectedLoading } = useRejected(100);
```

**Pagination** — after the `isLoading` variable:
```tsx
const {
  visible,
  page,
  totalPages,
  canPrev,
  canNext,
  setPage,
  rangeStart,
  rangeEnd,
  total,
} = usePagination(data, 10);
```

Use `visible` (not `data`) in the `.map()`:
```tsx
{visible?.map((decision) => ...
```

**Pagination controls** — after the tokens div, add:
```tsx
{totalPages > 1 && (
  <div className="flex items-center justify-center gap-4 text-sm">
    <button
      disabled={!canPrev}
      onClick={() => setPage(page - 1)}
      className="px-3 py-1 rounded bg-slate-700 disabled:opacity-30 text-slate-200"
    >
      ← Prev
    </button>
    <span className="text-slate-400">
      {rangeStart}–{rangeEnd} of {total}
    </span>
    <button
      disabled={!canNext}
      onClick={() => setPage(page + 1)}
      className="px-3 py-1 rounded bg-slate-700 disabled:opacity-30 text-slate-200"
    >
      Next →
    </button>
  </div>
)}
```

**Timestamp in DecisionRow** — inside the address line, after the copy button:
```tsx
<span className="text-[10px] text-slate-600 ml-auto">
  {formatRelativeTime(decision.decidedAt)}
</span>
```

### 2. `router/routes.tsx`

- Remove line: `import { LiveFeedPage } from '@/pages/live-feed';`
- Remove line: `{ path: 'live', element: <LiveFeedPage /> },`
- Opcional: add redirect: `{ path: 'live', element: <Navigate to="/tokens" replace /> },`

### 3. `live-feed/index.tsx`

Delete file.

## Verification

1. `npx tsc --noEmit -p apps/frontend/tsconfig.json` → exit 0
2. `cd apps/frontend && npx vitest run` → all pass
3. Manual: http://localhost:5173/tokens → 10 tokens, pagination controls, "hace X" timestamps

## Time

~15 min.

# Hide Attempts from Queue View

## Goal
Remove the `attempts` field display from the frontend queue view. The field stays in the backend — it's still useful for internal debugging — but the UI should not show it.

## Files
- `apps/frontend/src/features/crypto-news-publisher/ui/queue-view.tsx`

## Todo

### 1. Frontend — queue-view.tsx
Find the line(s) that render attempts and remove them. Likely something like:
```tsx
<span>Attempts: {entry.attempts}</span>
```
or a column in a table. Read the file, grep for `attempts`, find the exact rendering, and delete the JSX that shows it.

## Verification
- `cd apps/frontend && npx tsc --noEmit --incremental false` passes clean
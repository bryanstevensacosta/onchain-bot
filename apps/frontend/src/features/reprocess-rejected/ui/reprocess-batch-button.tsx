import { useState } from 'react';
import { useReprocessBatch } from '../model/use-reprocess';

interface Props {
  disabled?: boolean;
}

export function ReprocessBatchButton({ disabled }: Props) {
  const mutation = useReprocessBatch();
  const [pending, setPending] = useState(false);

  const onClick = () => {
    if (pending) return;
    if (
      !window.confirm(
        'Reprocess ALL retryable rejected tokens? Concurrency 5, delay 200ms between calls. This will call the enrichment APIs again and may publish to Telegram.',
      )
    ) {
      return;
    }
    setPending(true);
    mutation.mutate(
      { limit: 50, retryableOnly: true, concurrency: 5, delayMs: 200 },
      {
        onSettled: () => setPending(false),
      },
    );
  };

  const busy = pending || mutation.isPending;
  const processed =
    mutation.data?.filter((r) => r.status === 'REPROCESSED').length ?? 0;
  const total = mutation.data?.length ?? 0;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={disabled || busy}
        className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded"
      >
        {busy ? '⏳ reprocessing…' : '↻ Reprocess all'}
      </button>
      {mutation.isSuccess && total > 0 && (
        <span className="text-xs text-slate-400">
          ✓ {processed}/{total} reprocessed
          {total - processed > 0 && ` (${total - processed} failed/skipped)`}
        </span>
      )}
      {mutation.isError && (
        <span className="text-xs text-red-400">✗ {mutation.error.message}</span>
      )}
    </div>
  );
}

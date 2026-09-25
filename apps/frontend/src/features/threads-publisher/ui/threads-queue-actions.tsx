import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/ui';
import { useCancelThreadsQueueEntry } from '../model/use-threads-queue';

/**
 * Threads queue cancel button — thin wrapper bound to the injected
 * `queryKeys` scope (invalidated after a successful cancel) instead of
 * cloning the feed row actions.
 */
export interface ThreadsQueueCancelButtonProps {
  entryId: string;
  status: string;
  queryKeys: readonly unknown[];
}

export function ThreadsQueueCancelButton({
  entryId,
  status,
  queryKeys,
}: ThreadsQueueCancelButtonProps): React.ReactElement | null {
  const qc = useQueryClient();
  const cancelMutation = useCancelThreadsQueueEntry();

  if (status !== 'PENDING') {
    return null;
  }

  return (
    <Button
      variant="danger"
      size="sm"
      disabled={cancelMutation.isPending}
      onClick={() => {
        if (window.confirm('Cancel this threads queue entry?')) {
          cancelMutation.mutate(entryId, {
            onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys }),
          });
        }
      }}
    >
      {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
    </Button>
  );
}

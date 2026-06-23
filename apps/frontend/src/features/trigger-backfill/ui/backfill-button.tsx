import { Button } from '@/shared/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerBackfill, type BackfillResult } from '../api/backfill-client';
import { kolKeys } from '@/entities/kol';

interface BackfillButtonProps {
  kolId: string;
  limit?: number;
}

export function BackfillButton({ kolId, limit = 20 }: BackfillButtonProps) {
  const qc = useQueryClient();
  const mutation = useMutation<BackfillResult, Error>({
    mutationFn: () => triggerBackfill({ kolId, limit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kolKeys.all });
      qc.invalidateQueries({ queryKey: ['canonical'] });
      qc.invalidateQueries({ queryKey: ['score'] });
      qc.invalidateQueries({ queryKey: ['decision'] });
      qc.invalidateQueries({ queryKey: ['published'] });
    },
  });

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? '⏳ backfilling…' : '🔄 Backfill'}
      {mutation.isSuccess &&
        ` ✓ ${mutation.data.ingested}/${mutation.data.total}`}
      {mutation.isError && ` ✗ ${mutation.error.message}`}
    </Button>
  );
}

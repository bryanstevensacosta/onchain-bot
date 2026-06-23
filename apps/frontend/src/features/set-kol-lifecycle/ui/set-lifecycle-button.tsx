import { Button } from '@/shared/ui';
import { KolLifecycleStatus } from '@/entities/kol/model/types';
import { useSetKolLifecycle } from '../api/set-lifecycle-client';

interface SetKolLifecycleButtonProps {
  kolId: string;
  status: KolLifecycleStatus;
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
}

export function SetKolLifecycleButton({
  kolId,
  status,
  label,
  tone = 'secondary',
}: SetKolLifecycleButtonProps) {
  const mutation = useSetKolLifecycle();
  return (
    <Button
      variant={tone}
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ kolId, status })}
    >
      {label}
    </Button>
  );
}

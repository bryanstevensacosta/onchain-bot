import { Badge } from '@/shared/ui';

interface KolStatusPillProps {
  isActive: boolean;
}

export function KolStatusPill({ isActive }: KolStatusPillProps) {
  return (
    <Badge tone={isActive ? 'green' : 'gray'}>
      {isActive ? 'active' : 'paused'}
    </Badge>
  );
}

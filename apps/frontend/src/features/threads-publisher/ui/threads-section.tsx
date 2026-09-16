import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/shared/ui';

/**
 * Generic threads section shell — injects `basePath` + `queryKeys` so
 * threads blocks stay thin wrappers instead of as-is clones of the
 * crypto-news sections. `basePath` labels the backend prefix the block
 * talks to; `queryKeys` scopes the manual refresh button.
 */
export interface ThreadsSectionProps {
  basePath: string;
  queryKeys: readonly unknown[];
  title: string;
  children: ReactNode;
}

export function ThreadsSection({
  basePath,
  queryKeys,
  title,
  children,
}: ThreadsSectionProps): React.ReactElement {
  const qc = useQueryClient();
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: queryKeys })}
        >
          Refresh
        </Button>
      </div>
      <p
        className="mt-1 font-mono text-[11px] text-slate-500"
        data-base-path={basePath}
      >
        {basePath}
      </p>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

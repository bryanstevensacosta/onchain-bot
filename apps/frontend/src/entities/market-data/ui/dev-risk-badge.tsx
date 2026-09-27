import { useEffect } from 'react';
import { Badge } from '@/shared/ui';
import type { DevWalletView } from '../model/types';

export function devRiskTone(
  pct: number | null,
): 'green' | 'yellow' | 'red' | 'gray' {
  if (pct === null || pct === undefined) return 'gray';
  if (pct >= 15) return 'red';
  if (pct >= 5) return 'yellow';
  return 'green';
}

export function DevRiskBadge({
  devPctSupply,
  devWallets,
}: {
  readonly devPctSupply: number | null;
  readonly devWallets?: ReadonlyArray<DevWalletView> | null;
}) {
  const tone = devRiskTone(devPctSupply);
  const label =
    devPctSupply === null || devPctSupply === undefined
      ? 'Dev N/A'
      : `Dev ${devPctSupply.toFixed(2)}%`;
  const title =
    devWallets && devWallets.length > 0
      ? devWallets
          .slice(0, 3)
          .map((w) => `${w.wallet}: ${w.percentOfSupply ?? 'N/A'}%`)
          .join(' | ')
      : 'no dev data (no key or no data)';
  return (
    <span data-testid="dev-risk-badge" title={title}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

export interface DevDumpAlert {
  readonly triggered: boolean;
  readonly reason: string | null;
}

export function useDevDumpAlert(
  devPctSupply: number | null,
  opts: {
    readonly thresholdPct?: number;
    readonly onAlert?: (pct: number) => void;
  } = {},
): DevDumpAlert {
  const threshold = opts.thresholdPct ?? 15;
  const triggered = devPctSupply !== null && devPctSupply >= threshold;
  useEffect(() => {
    if (triggered && devPctSupply !== null) {
      opts.onAlert?.(devPctSupply);
    }
  }, [triggered, devPctSupply, opts]);
  if (!triggered) return { triggered: false, reason: null };
  return {
    triggered: true,
    reason: `dev holds ${devPctSupply?.toFixed(2)}% >= ${threshold}% — dump-risk wiring point`,
  };
}

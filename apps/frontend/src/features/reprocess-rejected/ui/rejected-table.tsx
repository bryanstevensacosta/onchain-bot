import { Badge } from '@/shared/ui';
import { truncateAddress, chainLabel } from '@/shared/lib';
import { reasonLabel, REASON_TONE } from '@/shared/lib/signalLabels';
import type { RejectedTokenDiagnostics } from '../api/reprocess-client';

const RECOMMENDATION_TONE: Record<
  RejectedTokenDiagnostics['recommended'],
  'green' | 'yellow' | 'red' | 'gray' | 'blue'
> = {
  REPROCESS: 'green',
  SKIP: 'gray',
  NEEDS_BLACKLIST_REVIEW: 'red',
  NEEDS_CHAIN_SUPPORT: 'blue',
};

interface Props {
  data: ReadonlyArray<RejectedTokenDiagnostics>;
  isLoading: boolean;
  onReprocessOne: (chain: string, address: string) => void;
  isReprocessingOne: boolean;
  reprocessingChain?: string;
  reprocessingAddress?: string;
}

export function RejectedTable({
  data,
  isLoading,
  onReprocessOne,
  isReprocessingOne,
  reprocessingChain,
  reprocessingAddress,
}: Props) {
  if (isLoading) {
    return (
      <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="text-slate-400 text-sm py-8 text-center">
        No hay tokens rechazados.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-2 px-2">Chain</th>
            <th className="py-2 px-2">Address</th>
            <th className="py-2 px-2">Score</th>
            <th className="py-2 px-2">Class.</th>
            <th className="py-2 px-2">Reasons</th>
            <th className="py-2 px-2">Completeness</th>
            <th className="py-2 px-2">Providers</th>
            <th className="py-2 px-2">Recommended</th>
            <th className="py-2 px-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => {
            const isRowBusy =
              isReprocessingOne &&
              d.chain === reprocessingChain &&
              d.address === reprocessingAddress;
            return (
              <tr
                key={`${d.chain}:${d.address}`}
                className="border-b border-slate-800/50 hover:bg-slate-800/30"
              >
                <td className="py-2 px-2">
                  <Badge tone="blue">{chainLabel(d.chain)}</Badge>
                </td>
                <td className="py-2 px-2 font-mono text-xs">
                  <span title={d.address}>
                    {truncateAddress(d.address, 6, 6)}
                  </span>
                </td>
                <td className="py-2 px-2">{d.score}</td>
                <td className="py-2 px-2">
                  <Badge tone="gray">{d.classification}</Badge>
                </td>
                <td className="py-2 px-2">
                  <div className="flex flex-wrap gap-1">
                    {d.reasons.map((r) => (
                      <Badge key={r.code} tone={REASON_TONE[r.code] ?? 'gray'}>
                        {reasonLabel(r.code)}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <CompletenessBar value={d.snapshotCompleteness} />
                </td>
                <td className="py-2 px-2">
                  <ProviderStatus errors={d.providerErrors} />
                </td>
                <td className="py-2 px-2">
                  <Badge tone={RECOMMENDATION_TONE[d.recommended]}>
                    {d.recommended}
                  </Badge>
                </td>
                <td className="py-2 px-2">
                  {d.recommended === 'REPROCESS' ? (
                    <button
                      onClick={() => onReprocessOne(d.chain, d.address)}
                      disabled={isRowBusy}
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded"
                    >
                      {isRowBusy ? '⏳' : '↻ Reprocess'}
                    </button>
                  ) : (
                    <span className="text-slate-500 text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompletenessBar({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-slate-500 text-xs">no snapshot</span>;
  const pct = Math.round(value * 100);
  const color =
    pct >= 60 ? 'bg-green-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-800 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400">{pct}%</span>
    </div>
  );
}

function ProviderStatus({
  errors,
}: {
  errors: ReadonlyArray<{ provider: string; message: string }>;
}) {
  if (errors.length === 0) {
    return <span className="text-green-400 text-xs">✓ all ok</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {errors.map((e) => (
        <Badge key={e.provider} tone="red" className="text-xs">
          ✗ {e.provider}
        </Badge>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useTrackedCalls } from '@/entities/tracked-call';
import { Badge, Card, ChainIcon } from '@/shared/ui';
import {
  formatUsd,
  formatPercent,
  formatRelativeTime,
  truncateAddress,
  chainLabel,
} from '@/shared/lib';

export function TrackedCallsWidget() {
  const [onlyWithMilestones, setOnlyWithMilestones] = useState(false);
  const { data, isLoading } = useTrackedCalls({
    limit: 20,
    hasMilestones: onlyWithMilestones || undefined,
  });

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wide text-slate-400">
          🎯 Tracked calls
        </h3>
        <label className="text-xs text-slate-400 flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyWithMilestones}
            onChange={(e) => setOnlyWithMilestones(e.target.checked)}
            className="accent-blue-500"
          />
          Only with milestones
        </label>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500">Cargando…</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left border-b border-slate-800">
              <th className="py-1">Token</th>
              <th>MC @ pub</th>
              <th>MC now</th>
              <th>Max ×</th>
              <th>Δ price</th>
              <th>Published</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <tr
                key={`${t.chain}-${t.address}`}
                className="border-b border-slate-800/50 hover:bg-slate-800/30"
              >
                <td className="py-2">
                  <Badge tone="white">
                    <ChainIcon chain={t.chain} className="mr-1" />
                    {chainLabel(t.chain)}
                  </Badge>
                  <Link
                    to={`/tokens/${t.chain}/${t.address}`}
                    className="text-slate-100 hover:text-blue-400 font-medium ml-1"
                  >
                    {t.ticker ? `$${t.ticker}` : truncateAddress(t.address)}
                  </Link>
                </td>
                <td className="font-bold tabular-nums">
                  {formatUsd(t.mcAtPublish)}
                </td>
                <td className="tabular-nums text-slate-300">
                  {t.mcNow !== null ? formatUsd(t.mcNow) : '—'}
                </td>
                <td>
                  {t.maxMilestone !== null ? (
                    <Badge tone="green">{t.maxMilestone.toFixed(1)}×</Badge>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td
                  className={`tabular-nums ${
                    t.priceDropPercent === null
                      ? 'text-slate-500'
                      : t.priceDropPercent >= 0
                        ? 'text-green-400'
                        : 'text-red-400'
                  }`}
                >
                  {t.priceDropPercent !== null
                    ? formatPercent(t.priceDropPercent)
                    : '—'}
                </td>
                <td className="text-slate-400">
                  {formatRelativeTime(t.publishedAt)}
                </td>
                <td>
                  <Badge tone={t.isActive ? 'green' : 'white'}>
                    {t.isActive ? 'active' : 'inactive'}
                  </Badge>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-4 text-center text-slate-500 italic"
                >
                  No tracked calls
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}

import { Link } from 'react-router-dom';
import { useTopScores } from '@/entities/token-score';
import { Badge, Card, ChainIcon } from '@/shared/ui';
import { formatRelativeTime } from '@/shared/lib';
import { tierTone } from '@/entities/token-score';

export function TopTokensTable() {
  const { data, isLoading } = useTopScores(20);

  if (isLoading) {
    return <Card className="text-xs text-slate-500">Cargando…</Card>;
  }

  return (
    <Card>
      <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-3">
        🔥 Top tokens (last 24h)
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left border-b border-slate-800">
            <th className="py-1">Chain</th>
            <th>Token</th>
            <th>Score</th>
            <th>Tier</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((s) => (
            <tr
              key={`${s.chain}-${s.address}`}
              className="border-b border-slate-800/50 hover:bg-slate-800/30"
            >
              <td className="py-2">
                <Badge tone="white">
                  <ChainIcon chain={s.chain} className="mr-1" />
                  {s.chain === 'solana' ? 'Solana' : 'EVM'}
                </Badge>
              </td>
              <td>
                <Link
                  to={`/tokens/${s.chain}/${s.address}`}
                  className="text-slate-100 hover:text-blue-400 font-medium"
                >
                  {s.ticker ? `$${s.ticker}` : s.address.slice(0, 6) + '…'}
                </Link>
                <span className="text-slate-500 ml-2 font-mono text-[10px]">
                  {s.address.slice(0, 4)}…{s.address.slice(-4)}
                </span>
              </td>
              <td className="font-bold tabular-nums">{s.score}</td>
              <td>
                <Badge tone={tierTone(s.tier)}>{s.tier}</Badge>
              </td>
              <td className="text-slate-400">
                {formatRelativeTime(s.scoredAt)}
              </td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="py-4 text-center text-slate-500 italic"
              >
                No tokens scored yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

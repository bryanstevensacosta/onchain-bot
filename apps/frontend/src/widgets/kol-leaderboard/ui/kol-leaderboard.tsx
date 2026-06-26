import type { KolReputationView } from '@/entities/kol-reputation';
import { Badge, Card } from '@/shared/ui';

interface KolLeaderboardProps {
  rows?: ReadonlyArray<KolReputationView>;
  isLoading?: boolean;
}

export function KolLeaderboard({ rows, isLoading }: KolLeaderboardProps = {}) {
  return (
    <Card>
      <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-3">
        🏆 KOL reputation leaderboard
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left border-b border-slate-800">
            <th>Rank</th>
            <th>KOL</th>
            <th>Score</th>
            <th>Calls</th>
            <th>Strong</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r, i) => (
            <tr key={r.kolId} className="border-b border-slate-800/50">
              <td className="py-2 text-slate-400">#{i + 1}</td>
              <td className="font-mono text-slate-300">{r.kolId}</td>
              <td>
                <Badge
                  tone={
                    r.score >= 0.7
                      ? 'green'
                      : r.score >= 0.4
                        ? 'yellow'
                        : 'orange'
                  }
                >
                  {r.score.toFixed(2)}
                </Badge>
              </td>
              <td className="tabular-nums">{r.metrics.totalMentions}</td>
              <td className="tabular-nums text-green-400">{r.metrics.x2Count}</td>
            </tr>
          ))}
          {isLoading && (
            <tr>
              <td
                colSpan={5}
                className="py-4 text-center text-slate-500 italic"
              >
                Cargando…
              </td>
            </tr>
          )}
          {(!rows || rows.length === 0) && !isLoading && (
            <tr>
              <td
                colSpan={5}
                className="py-4 text-center text-slate-500 italic"
              >
                No reputation data yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

import type { KolView } from '@/entities/kol';
import { useKols } from '@/entities/kol';
import {
  useTopKolReputation,
  useKolReputationMap,
} from '@/entities/kol-reputation';
import type { KolReputationView } from '@/entities/kol-reputation';
import { KolLeaderboard } from '@/widgets/kol-leaderboard';
import { Card } from '@/shared/ui';
import { formatRelativeTime } from '@/shared/lib';
import { BackfillButton } from '@/features/trigger-backfill';
import { SetKolLifecycleButton } from '@/features/set-kol-lifecycle';

interface KolRowProps {
  kol: KolView;
  rep: KolReputationView | undefined;
}

function KolRow({ kol, rep }: KolRowProps) {
  const score = rep?.score ?? 0.5;
  const confidence = rep?.confidence ?? 'LOW';
  const tone =
    score >= 0.7
      ? 'text-green-400'
      : score <= 0.3
        ? 'text-red-400'
        : 'text-yellow-400';

  return (
    <Card className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <div className="text-sm text-slate-100 truncate">{kol.title}</div>
          <div className="text-xs text-slate-500 font-mono truncate">
            {kol.id}
            {kol.handle && ` · @${kol.handle}`}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-600 mt-0.5">
            {kol.lifecycleStatus}
            {kol.lifecycleStatus === 'ACTIVE' && kol.isActive && ' · listening'}
            {kol.lifecycleStatus !== 'ACTIVE' && ' · paused'}
            {' · '}
            <span className={tone}>
              rep {score.toFixed(2)} ({confidence})
            </span>
            {rep && (
              <>
                {' · '}
                <span className="text-slate-500">
                  {rep.totalCalls} calls
                  {rep.avgAthMultiple !== null &&
                    ` · ${rep.avgAthMultiple.toFixed(2)}x ATH`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-slate-500 w-16 text-right">
          {formatRelativeTime(kol.lastIngestedAt)}
        </span>
        {kol.lifecycleStatus !== 'ACTIVE' && (
          <SetKolLifecycleButton
            kolId={kol.id}
            status="ACTIVE"
            label="Activate"
            tone="primary"
          />
        )}
        {kol.lifecycleStatus === 'ACTIVE' && (
          <SetKolLifecycleButton
            kolId={kol.id}
            status="DORMANT"
            label="Deactivate"
          />
        )}
        <BackfillButton kolId={kol.id} limit={20} />
      </div>
    </Card>
  );
}

export function KolsPage() {
  const { data, isLoading } = useKols();
  const { data: topRep } = useTopKolReputation(10);
  const { get: getRep } = useKolReputationMap();

  return (
    <div className="space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">KOLs</h1>
        <p className="text-sm text-slate-400">
          KOLs de Telegram monitorizados. Toda la info: identidad, lifecycle,
          reputación por outcomes, y leaderboard top por score.
        </p>
      </header>

      <KolLeaderboard rows={topRep} isLoading={isLoading} />

      {isLoading && <Card className="text-xs text-slate-500">Cargando…</Card>}

      <div className="space-y-2">
        {data?.map((k) => (
          <KolRow key={k.id} kol={k} rep={getRep(k.id)} />
        ))}
        {data?.length === 0 && !isLoading && (
          <Card className="text-center text-slate-500 italic py-8">
            No hay KOLs registrados
          </Card>
        )}
      </div>
    </div>
  );
}

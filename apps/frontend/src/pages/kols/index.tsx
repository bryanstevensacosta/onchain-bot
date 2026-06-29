import type { KolView } from '@/entities/kol';
import { useKols } from '@/entities/kol';
import {
  useTopKolReputation,
  useKolReputationMap,
} from '@/entities/kol-reputation';
import type { KolReputationView } from '@/entities/kol-reputation';
import { KolLeaderboard } from '@/widgets/kol-leaderboard';
import { Button, Card } from '@/shared/ui';
import { formatRelativeTime, usePagination } from '@/shared/lib';
import { BackfillButton } from '@/features/trigger-backfill';
import { SetKolLifecycleButton } from '@/features/set-kol-lifecycle';
import { RecomputeKolReputationButton } from '@/features/recompute-kol-reputation/ui/recompute-kol-reputation-button';
import { useKolScoreFormula } from '@/features/kol-score-formula/model/use-kol-score-formula';
import { KolScoreFormulaSelect } from '@/features/kol-score-formula/ui/kol-score-formula-select';

interface KolRowProps {
  kol: KolView;
  rep: KolReputationView | undefined;
  formulaId: string;
}

function KolRow({ kol, rep, formulaId }: KolRowProps) {
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
                  {rep.metrics.totalMentions} calls
                  {rep.metrics.x5Count > 0 && ` · ${rep.metrics.x5Count}X5`}
                  {rep.metrics.x10Count > 0 && ` · ${rep.metrics.x10Count}X10`}
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
        <RecomputeKolReputationButton kolId={kol.id} formulaId={formulaId} />
        <BackfillButton kolId={kol.id} limit={20} />
      </div>
    </Card>
  );
}

export function KolsPage() {
  const { data, isLoading } = useKols();
  const { data: topRep } = useTopKolReputation(10);
  const { get: getRep } = useKolReputationMap();
  const { formulaId, setFormulaId } = useKolScoreFormula();

  const {
    visible,
    page,
    totalPages,
    rangeStart,
    rangeEnd,
    total,
    canPrev,
    canNext,
    setPage,
  } = usePagination(data, 15);

  return (
    <div className="space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">KOLs</h1>
        <p className="text-sm text-slate-400">
          KOLs de Telegram monitorizados. Toda la info: identidad, lifecycle,
          reputación por outcomes, y leaderboard top por score.
        </p>
      </header>

      <Card className="max-w-md">
        <KolScoreFormulaSelect value={formulaId} onChange={setFormulaId} />
      </Card>

      <KolLeaderboard rows={topRep} isLoading={isLoading} />

      {isLoading && <Card className="text-xs text-slate-500">Cargando…</Card>}

      <div className="space-y-2">
        {visible.map((k) => (
          <KolRow key={k.id} kol={k} rep={getRep(k.id)} formulaId={formulaId} />
        ))}
        {data?.length === 0 && !isLoading && (
          <Card className="text-center text-slate-500 italic py-8">
            No hay KOLs registrados
          </Card>
        )}
      </div>

      {total > 15 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            {rangeStart}–{rangeEnd} de {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!canPrev}
              onClick={() => setPage(page - 1)}
            >
              ← Anterior
            </Button>
            <span className="text-xs text-slate-400 self-center">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canNext}
              onClick={() => setPage(page + 1)}
            >
              Siguiente →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

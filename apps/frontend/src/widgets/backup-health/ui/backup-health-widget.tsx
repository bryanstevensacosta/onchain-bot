import { useQuery } from '@tanstack/react-query';
import {
  backupHealthKeys,
  fetchBackupHealth,
} from '../api/backup-health-queries';
import { Badge, Card, CardTitle } from '@/shared/ui';
import type { BackupStatus } from '../model/types';

function verdictTone(
  verdict: BackupStatus['verdict'],
): 'green' | 'amber' | 'red' {
  if (verdict === 'amber') return 'amber';
  if (verdict === 'red') return 'red';
  return 'green';
}

function verdictLabel(verdict: BackupStatus['verdict']): string {
  if (verdict === 'amber') return 'AMBER';
  if (verdict === 'red') return 'RED';
  return 'GREEN';
}

function drillLabel(result: BackupStatus['lastDrillResult']): string {
  if (result === 'pass') return 'pass';
  if (result === 'fail') return 'fail';
  return '—';
}

function diskColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-orange-400';
  return 'bg-green-400';
}

function diskBgColor(pct: number): string {
  if (pct >= 90) return 'bg-red-900/30';
  if (pct >= 70) return 'bg-orange-900/30';
  return 'bg-green-900/30';
}

export function BackupHealthWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: backupHealthKeys.all,
    queryFn: fetchBackupHealth,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <Card>
        <div className="text-slate-400 text-sm">
          Cargando estado de respaldos…
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardTitle>💾 Backup Health</CardTitle>
        <div className="text-red-400 text-sm mt-2">Offline</div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>💾 Backup Health</CardTitle>
        <Badge tone={verdictTone(data.verdict)}>
          {verdictLabel(data.verdict)}
        </Badge>
      </div>
      <div className="space-y-3 mt-3">
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Disco: {data.diskPct}%</span>
            <span>{data.dumpCount} dumps</span>
          </div>
          <div className={`h-2 rounded-full ${diskBgColor(data.diskPct)}`}>
            <div
              className={`h-2 rounded-full ${diskColor(data.diskPct)} transition-all`}
              style={{ width: `${Math.min(data.diskPct, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Más reciente</span>
          <span className="text-slate-100">
            {data.newestFile} · {data.newestAgeH}
          </span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Bucket</span>
          <span className="text-slate-100">{data.bucket ?? '—'}</span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Offsite lag</span>
          <span className="text-slate-100">{data.offsiteLag ?? '—'}</span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Último drill</span>
          <span className="text-slate-100">
            {data.lastDrillAt ?? '—'} · {drillLabel(data.lastDrillResult)}
          </span>
        </div>

        {data.stale && (
          <div className="text-amber-300 text-xs">
            Datos desactualizados — sin respaldos recientes
          </div>
        )}
      </div>
    </Card>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/shared/ui';
import { fetchIngestionHealth } from '@/widgets/ingestion-health/api/ingestion-health-queries';

/**
 * KPI cards.
 *
 * NOTE (T18 deprecados-deuda-tecnica): the `GET /dashboard/kpis`
 * endpoint is dead — DashboardModule is commented out in the backend
 * AppModule, so the route 404s. The widget previously degraded to the
 * same zeros via the error path; it now reads KOL counts straight from
 * ingestion-health and renders 0 for the unwired aggregates. Rewire to
 * /dashboard/kpis only after the backend module is restored.
 */
export function KpiCards() {
  const healthQuery = useQuery({
    queryKey: ['ingestion-health'],
    queryFn: fetchIngestionHealth,
    refetchInterval: 10_000,
  });

  const activeKols = healthQuery.data?.activeChannels ?? 0;
  const totalKols = healthQuery.data?.maxSafeChannels ?? 0;
  const totalCalls = 0;
  const approvedCount = 0;
  const rejectedCount = 0;
  const approvalRate = 0;
  const publishedCount = 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        label="📡 KOLs"
        value={`${activeKols}/${totalKols}`}
        sub={`${activeKols} active / ${totalKols} total`}
      />
      <KpiCard
        label="🔥 Canonical calls"
        value={String(totalCalls)}
        sub="all time"
      />
      <KpiCard
        label="✅ Approval rate"
        value={`${(approvalRate * 100).toFixed(1)}%`}
        sub={`${approvedCount} approved / ${rejectedCount} rejected`}
        tone={approvalRate > 0.1 ? 'green' : 'orange'}
      />
      <KpiCard
        label="📤 Published"
        value={String(publishedCount)}
        sub="to Telegram"
        tone="green"
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  tone?: 'green' | 'orange';
}

function KpiCard({ label, value, sub, tone }: KpiCardProps) {
  const valueColor =
    tone === 'green'
      ? 'text-green-400'
      : tone === 'orange'
        ? 'text-orange-400'
        : 'text-slate-100';
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`text-3xl font-bold tabular-nums mt-1 ${valueColor}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </Card>
  );
}

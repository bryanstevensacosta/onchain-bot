import { useDashboardKpis } from '@/entities/dashboard';
import { Card } from '@/shared/ui';

export function KpiCards() {
  const kpis = useDashboardKpis();

  const activeKols = kpis.data?.activeKols ?? 0;
  const totalKols = kpis.data?.totalKols ?? 0;
  const totalCalls = kpis.data?.totalCanonicalCalls ?? 0;
  const approvedCount = kpis.data?.approvedDecisions ?? 0;
  const rejectedCount = kpis.data?.rejectedDecisions ?? 0;
  const approvalRate =
    approvedCount + rejectedCount > 0
      ? approvedCount / (approvedCount + rejectedCount)
      : 0;
  const publishedCount = kpis.data?.publishedCalls ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        label="📡 KOLs"
        value={`${activeKols}/${totalKols}`}
        sub="active"
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

import { KpiCards } from '@/widgets/kpi-cards';
import { LiveFeed } from '@/widgets/live-feed';
import { TopTokensTable } from '@/widgets/top-tokens-table';
import { TrackedCallsWidget } from '@/widgets/tracked-calls';

export function DashboardPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <KpiCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveFeed />
        <TopTokensTable />
      </div>
      <TrackedCallsWidget />
    </div>
  );
}

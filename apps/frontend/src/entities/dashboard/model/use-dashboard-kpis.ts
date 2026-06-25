import { useQuery } from '@tanstack/react-query';
import { dashboardKeys, fetchDashboardKpis } from '../api/dashboard-queries';

export function useDashboardKpis() {
  return useQuery({
    queryKey: dashboardKeys.current(),
    queryFn: fetchDashboardKpis,
    refetchInterval: 5_000,
  });
}

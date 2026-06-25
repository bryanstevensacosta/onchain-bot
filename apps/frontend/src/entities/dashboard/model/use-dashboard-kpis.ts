import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardKeys, fetchDashboardKpis } from '../api/dashboard-queries';
import { useEventStream, WS_EVENTS } from '@/shared/realtime';

export function useDashboardKpis() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: dashboardKeys.current(),
    queryFn: fetchDashboardKpis,
    refetchInterval: 30_000,
    staleTime: 1_000,
  });

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.current() });
  }, [queryClient]);

  useEventStream<{ updatedAt: string }>(
    WS_EVENTS.DashboardKpisUpdated,
    refetch,
  );

  useEffect(() => {
    return () => {
      refetch();
    };
  }, [refetch]);

  return query;
}

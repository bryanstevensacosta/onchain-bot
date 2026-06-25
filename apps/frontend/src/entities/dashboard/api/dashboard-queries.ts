import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { DashboardKpis } from '../model/types';

export const dashboardKeys = {
  all: ['dashboard-kpis'] as const,
  current: () => [...dashboardKeys.all, 'current'] as const,
};

export function fetchDashboardKpis(): Promise<DashboardKpis> {
  return httpGet<DashboardKpis>(ENDPOINTS.dashboard.kpis);
}

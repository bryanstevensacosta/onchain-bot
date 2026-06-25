import { httpGet, httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { GateAllowView, TrackedCallView } from '../model/types';

export interface TrackedCallsFilters {
  minMilestone?: number;
  maxPriceDrop?: number;
  hasMilestones?: boolean;
  limit?: number;
}

export const trackedCallKeys = {
  all: ['tracked-calls'] as const,
  list: (filters: TrackedCallsFilters) =>
    [...trackedCallKeys.all, 'list', filters] as const,
  detail: (chain: string, address: string) =>
    [...trackedCallKeys.all, chain, address] as const,
};

export function buildQuery(filters: TrackedCallsFilters): string {
  const params = new URLSearchParams();
  if (filters.minMilestone !== undefined) {
    params.set('min_milestone', String(filters.minMilestone));
  }
  if (filters.maxPriceDrop !== undefined) {
    params.set('max_price_drop', String(filters.maxPriceDrop));
  }
  if (filters.hasMilestones !== undefined) {
    params.set('has_milestones', String(filters.hasMilestones));
  }
  if (filters.limit !== undefined) {
    params.set('limit', String(filters.limit));
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export async function fetchTrackedCalls(
  filters: TrackedCallsFilters = {},
): Promise<ReadonlyArray<TrackedCallView>> {
  return httpGet<ReadonlyArray<TrackedCallView>>(
    `${ENDPOINTS.trackedCalls.list}${buildQuery(filters)}`,
  );
}

export async function fetchTrackedCall(
  chain: string,
  address: string,
): Promise<TrackedCallView> {
  return httpGet<TrackedCallView>(
    ENDPOINTS.trackedCalls.detail(chain, address),
  );
}

export async function postGateAllow(input: {
  chain: string;
  address: string;
}): Promise<GateAllowView> {
  return httpPost<typeof input, GateAllowView>(
    ENDPOINTS.trackedCalls.gateAllow,
    input,
  );
}
